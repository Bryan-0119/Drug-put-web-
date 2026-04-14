function doGet(e) {
  var action = e.parameter.action;
  
  if (action === 'search') {
    var searchName = (e.parameter.name || "").toLowerCase();
    var searchRecordNo = (e.parameter.recordNo || "").toLowerCase();
    var searchBirthday = (e.parameter.birthday || "").toLowerCase();

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("寄庫總表");
    var dataRange = sheet.getDataRange().getValues();
    var results = [];
    
    for (var i = 1; i < dataRange.length; i++) {
      var rowName = String(dataRange[i][1]).toLowerCase();
      var rowBirthday = String(dataRange[i][2]).toLowerCase();
      var rowRecordNo = String(dataRange[i][3]).toLowerCase();
      
      var isMatch = true;
      
      // 如果有輸入搜尋條件，才進行比對 (AND 邏輯)
      if (searchName && rowName.indexOf(searchName) === -1) isMatch = false;
      if (searchRecordNo && rowRecordNo.indexOf(searchRecordNo) === -1) isMatch = false;
      if (searchBirthday && rowBirthday.indexOf(searchBirthday) === -1) isMatch = false;
      
      if (isMatch) {
        results.push({
          id: dataRange[i][0],
          name: dataRange[i][1],
          birthday: dataRange[i][2],
          recordNo: dataRange[i][3],
          item: dataRange[i][4],
          initialQty: dataRange[i][5],
          remaining: dataRange[i][6],
          unit: dataRange[i][7],
          depositDate: Utilities.formatDate(new Date(dataRange[i][8]), "GMT+8", "yyyy-MM-dd")
        });
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({status: "success", data: results}))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var data = JSON.parse(e.postData.contents);
  var action = data.action;

  if (action === 'deposit') {
    var ws = sheet.getSheetByName("寄庫總表");
    var id = "DEP-" + Utilities.getUuid().substring(0, 8);
    var req = data.data;
    ws.appendRow([id, req.name, req.birthday, req.recordNo, req.item, req.quantity, req.quantity, req.unit, req.date]);
    return ContentService.createTextOutput(JSON.stringify({status: "success", id: id})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'withdraw') {
    var ws = sheet.getSheetByName("寄庫總表");
    var logWs = sheet.getSheetByName("提領紀錄");
    var req = data.data;
    var dataRange = ws.getDataRange().getValues();
    
    for (var i = 1; i < dataRange.length; i++) { 
      if (dataRange[i][0] === req.id) {
        var currentRemaining = parseInt(dataRange[i][6]);
        var withdrawAmount = parseInt(req.amount);
        if (withdrawAmount > currentRemaining) return ContentService.createTextOutput(JSON.stringify({status: "error", message: "提領量超過庫存"})).setMimeType(ContentService.MimeType.JSON);
        
        var newRemaining = currentRemaining - withdrawAmount;
        ws.getRange(i + 1, 7).setValue(newRemaining); 
        logWs.appendRow([req.date, req.id, dataRange[i][1], dataRange[i][8], dataRange[i][4], withdrawAmount, newRemaining]);
        return ContentService.createTextOutput(JSON.stringify({status: "success"})).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }
}