(function (root) {
  if (!root.indexedDB) return;
  let connection;
  function open() {
    if (!connection) {
      connection = new Promise((resolve, reject) => {
        const request = root.indexedDB.open('turtlekeeper-account-recovery', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('pending', { keyPath: 'phone' });
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => { database.close(); connection = null; };
          resolve(database);
        };
        request.onblocked = () => reject(new Error('本机恢复存储正在升级'));
        request.onerror = () => reject(request.error);
      }).catch(error => { connection = null; throw error; });
    }
    return connection;
  }

  async function access(phone, change) {
    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = change
        ? database.transaction('pending', 'readwrite', { durability: 'strict' })
        : database.transaction('pending', 'readonly');
      const store = transaction.objectStore('pending');
      const request = store.get(phone);
      let saved;
      request.onsuccess = () => {
        saved = request.result;
        if (change) {
          try { change(store, saved); } catch (error) { transaction.abort(); reject(error); }
        }
      };
      transaction.oncomplete = () => resolve(saved);
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  }

  root.TurtleAccountRecoveryStore = {
    read: phone => access(phone),
    save: snapshot => access(snapshot.phone, (store, saved) => {
      if (!saved || saved.localWrite < snapshot.localWrite) store.put(snapshot);
    }).then(saved => !saved || saved.localWrite < snapshot.localWrite),
    clear: (phone, localWrite) => access(phone, (store, saved) => {
      if (saved && saved.localWrite <= localWrite) store.delete(phone);
    }),
    remove: phone => access(phone, store => {
      store.delete(phone);
    })
  };
})(globalThis);
