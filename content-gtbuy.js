// GTBuy Order Exporter – Content Script
// Läuft auf gtbuy.com, hat Zugriff auf localStorage (Token) und kann API aufrufen

const API_BASE = 'https://test-api.gtbuy.com/order/listV2';

function getHeaders() {
  const token    = localStorage.getItem('USER_TOKEN') || '';
  const deviceId = localStorage.getItem('browser_device_id') || '';
  return {
    'X-Access-Token':    token,
    'gtbuy-Client-Type': 'WEB',
    'lang':              'en_US',
    'currency':          'USD',
    'browser_device_id': deviceId,
    'Accept':            'application/json'
  };
}

async function fetchPage(pageNo) {
  const params = new URLSearchParams({
    orderNo:         '',
    pageNo:          String(pageNo),
    pageSize:        '20',
    status:          '',
    hideCancelOrder: 'false'   // alle inkl. Canceled
  });
  const resp = await fetch(`${API_BASE}?${params}`, {
    method:      'GET',
    credentials: 'include',
    headers:     getHeaders()
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (!json.success) throw new Error(json.message || 'API error');
  return json.result;
}

// Holt alle Bestellungen, optional gefiltert nach Order-Nr-Range
async function fetchAllOrders(fromOrderNr, toOrderNr) {
  const allItems = [];
  let page = 1;

  while (true) {
    const result  = await fetchPage(page);
    const records = result.records || [];
    const pages   = result.pages   || 1;

    for (const order of records) {
      const orderNo = order.orderNo;

      // Range-Filter: Nummern sind chronologisch → DESC, neueste zuerst
      // "from" = neuere Grenze (größere Nr), "to" = ältere Grenze (kleinere Nr)
      if (fromOrderNr && orderNo > fromOrderNr) continue;   // noch zu neu
      if (toOrderNr   && orderNo < toOrderNr)  {            // zu alt → fertig
        return allItems;
      }

      for (const item of (order.itemList || [])) {
        // Try various field names the API might use for the product URL / ID
        const goodsId = item.goodsId || item.itemId || item.productId || item.spuId || '';
        const link    = item.goodsUrl || item.itemUrl || item.productUrl || item.link ||
                        (goodsId ? `https://gtbuy.com/productDetail?id=${goodsId}` : '');

        allItems.push({
          orderNo:    orderNo,
          orderDate:  order.orderTime ? order.orderTime.substring(0, 10) : '',
          name:       item.subject     || '',
          quantity:   item.quantity    || 0,
          unitPrice:  item.price       || 0,
          status:     item.orderStatusName || order.statusName || '',
          link:       link
        });
      }
    }

    if (page >= pages) break;
    page++;
  }
  return allItems;
}

// Message-Listener: Popup kommuniziert über chrome.tabs.sendMessage
chrome.runtime.onMessage.addListener