package com.turtlekeeper.app;

import com.alipay.sdk.app.PayTask;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "TurtleAlipay")
public class AlipayTeamPlugin extends Plugin {
    private final AtomicBoolean paying = new AtomicBoolean(false);

    @PluginMethod
    public void pay(PluginCall call) {
        String order = call.getString("orderString", "");
        if (order.isEmpty() || order.length() > 32768) { call.reject("支付订单无效"); return; }
        if (!paying.compareAndSet(false, true)) { call.reject("正在支付，请勿重复操作"); return; }
        // Construct/invoke SDK only after an explicit payment tap and consent.
        new Thread(() -> {
            try {
                Map<String, String> result = new PayTask(getActivity()).payV2(order, true);
                JSObject response = new JSObject();
                // SDK status is for UI only. API query/notification grants membership.
                response.put("resultStatus", result.get("resultStatus"));
                call.resolve(response);
            } catch (Exception error) { call.reject("暂时无法打开支付宝，请稍后重试"); }
            finally { paying.set(false); }
        }, "team-alipay").start();
    }
}
