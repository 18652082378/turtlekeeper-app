'use strict';
const crypto = require('node:crypto');

const defaults = Object.freeze({ enabled: false, targetTemperature: 20, difference: 3, remindTime: '18:00', advanceDays: 1, location: null });
const clock = date => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};
const futureDate = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const numberText = value => String(Math.round(value * 10) / 10);
function normalizeSettings(raw = {}) {
  const s = { ...defaults, ...raw };
  if (typeof s.enabled !== 'boolean' || typeof s.targetTemperature !== 'number' || !Number.isFinite(s.targetTemperature) || s.targetTemperature < -30 || s.targetTemperature > 50 || typeof s.difference !== 'number' || !Number.isInteger(s.difference) || s.difference < 1 || s.difference > 20 || !Number.isInteger(s.advanceDays) || s.advanceDays < 1 || s.advanceDays > 7 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.remindTime)) throw Object.assign(new Error('请检查温度、温差、提醒时间和提前天数'), { status: 400 });
  return { enabled: s.enabled, targetTemperature: Math.round(s.targetTemperature * 10) / 10, difference: s.difference, remindTime: s.remindTime, advanceDays: s.advanceDays, location: s.location || null };
}
function matches(settings, minimum) {
  return Number.isFinite(minimum) && minimum <= settings.targetTemperature - settings.difference;
}
function reminderBody(settings, forecast, today) {
  const dateText = forecast.date === futureDate(today, 1) ? '明天' : forecast.date === futureDate(today, 2) ? '后天' : `${Number(forecast.date.slice(5, 7))}月${Number(forecast.date.slice(8))}日`;
  return `龟友手账提醒您：${dateText}${settings.location.name}预计最低气温为${numberText(forecast.minimum)}℃，与预设温度相差${numberText(settings.targetTemperature - forecast.minimum)}℃，请提前做好准备。`;
}
function publicWeather(user) {
  let settings;
  try { settings = normalizeSettings(user?.weatherReminder || {}); } catch { settings = { ...defaults }; }
  // A previous provider's location consent does not authorize Apple requests.
  if (settings.enabled && user?.weatherConsentProvider !== 'apple-weather') settings.enabled = false;
  return { settings, notices: (user?.weatherNotices || []).slice(0, 14), lastCheck: user?.weatherLastCheck || null };
}

const { createWeatherProvider } = require('./weatherkit-provider');

function createWeatherDispatcher({ read, write, provider, configured, devices, send, invalidDevice = () => {}, now = () => new Date() }) {
  let running = false;
  return async function dispatch() {
    if (running || !configured() || !provider.configured()) return;
    running = true;
    try {
      const phones = Object.keys(read().users || {});
      for (const phone of phones) {
        let user = read().users?.[phone];
        if (!user?.weatherReminder?.enabled || user.weatherConsentProvider !== 'apple-weather') continue;
        let settings;
        try { settings = normalizeSettings(user.weatherReminder); } catch { continue; }
        if (!settings.location || !devices(user).length) continue;
        const time = clock(now()), minute = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
        const elapsed = minute(time.time) - minute(settings.remindTime);
        // A bounded 15-minute recovery window, never a stale all-day catch-up.
        if (elapsed < 0 || elapsed > 15) continue;
        const targetDate = futureDate(time.date, settings.advanceDays);
        const key = `${settings.location.id}:${targetDate}`;
        const revision = JSON.stringify(user.weatherReminder);
        if (user.weatherDeliveries?.[key] || user.weatherLastCheck?.key === key && user.weatherLastCheck?.day === time.date && user.weatherLastCheck?.status === 'normal' && user.weatherLastCheck?.revision === revision) continue;
        let forecast;
        try { forecast = await provider.forecast(settings.location); }
        catch {
          const db = read(); user = db.users?.[phone];
          if (user && JSON.stringify(user.weatherReminder) === revision) { user.weatherLastCheck = { key, day: time.date, checkedAt: now().toISOString(), status: 'unavailable' }; await write(db); }
          continue;
        }
        // Re-read after every network await so a concurrent save/logout/delete
        // cannot be overwritten by a stale full-database snapshot.
        let db = read(); user = db.users?.[phone];
        const current = clock(now());
        if (!user || JSON.stringify(user.weatherReminder) !== revision || current.date !== time.date || minute(current.time) - minute(settings.remindTime) > 15) continue;
        const day = forecast.days.find(d => d.date === targetDate);
        if (!day || !Number.isFinite(day.minimum) || now().getTime() - Date.parse(forecast.fetchedAt) > 3600000 || !Number.isFinite(Date.parse(forecast.fetchedAt))) {
          user.weatherLastCheck = { key, day: time.date, checkedAt: now().toISOString(), status: 'unavailable' }; await write(db); continue;
        }
        if (!matches(settings, day.minimum)) { user.weatherLastCheck = { key, day: time.date, checkedAt: now().toISOString(), status: 'normal', forecastDate: targetDate, minimum: day.minimum, revision }; await write(db); continue; }
        const tokens = devices(user);
        if (!tokens.length) continue;
        const body = reminderBody(settings, day, time.date);
        // Persist before APNs. An ambiguous APNs timeout is not retried: it
        // could have reached the phone already. Each device is attempted once.
        user.weatherDeliveries ||= {};
        if (user.weatherDeliveries[key]) continue;
        user.weatherDeliveries[key] = { attemptedAt: now().toISOString(), results: [] };
        const cutoff = futureDate(time.date, -30);
        for (const k of Object.keys(user.weatherDeliveries)) if (k.slice(-10) < cutoff) delete user.weatherDeliveries[k];
        user.weatherNotices = [{ id: crypto.randomUUID(), body, forecastDate: targetDate, minimum: day.minimum, difference: Math.round((settings.targetTemperature - day.minimum) * 10) / 10, locationName: settings.location.name, createdAt: now().toISOString() }, ...(user.weatherNotices || [])].slice(0, 14);
        user.weatherLastCheck = { key, day: time.date, checkedAt: now().toISOString(), status: 'attempted', forecastDate: targetDate, minimum: day.minimum };
        await write(db);
        const payload = { aps: { alert: { title: '低温提醒', body }, sound: 'default' }, route: 'weather', forecastDate: targetDate };
        for (const device of tokens) {
          // Settings may be disabled or the device removed during delivery.
          user = read().users?.[phone];
          const deliveryClock = clock(now());
          if (!user || deliveryClock.date !== time.date || minute(deliveryClock.time) - minute(settings.remindTime) > 15 || JSON.stringify(user.weatherReminder) !== revision || !devices(user).some(d => d.token === device.token)) break;
          let result;
          try { result = await send(device.token, payload); } catch { result = { ok: false }; }
          if (result.invalid) invalidDevice(phone, device.token);
          db = read(); user = db.users?.[phone];
          if (!user?.weatherDeliveries?.[key]) continue;
          user.weatherDeliveries[key].results.push({ deviceHash: crypto.createHash('sha256').update(device.token).digest('hex'), ok: Boolean(result.ok) });
          if (user.weatherLastCheck?.key === key) user.weatherLastCheck.status = user.weatherDeliveries[key].results.some(r => r.ok) ? 'sent' : 'failed';
          await write(db);
        }
      }
    } finally { running = false; }
  };
}
module.exports = { defaults, clock, futureDate, normalizeSettings, matches, reminderBody, publicWeather, createWeatherProvider, createWeatherDispatcher };
