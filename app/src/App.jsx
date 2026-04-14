import React, { useState } from 'react';
import { Search, PlusCircle, MinusCircle, CheckCircle2, AlertCircle, User, FileText, Printer } from 'lucide-react';

const ITEMS = [
  "猛健樂 2.5", "猛健樂 5", "猛健樂 7.5", "猛健樂 10", "猛健樂 15",
  "週纖達1.7", "週纖達2.4", "胰妥讚2", "胰妥讚4"
];

// 正確的 Google Apps Script Web App URL
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwodXQVy_zpymUK92jJnib8KflaRAJavcfxnci7YJe8ou1nJ4MQ88ud316ar_kMa0NO/exec';

export default function App() {
  const [activeTab, setActiveTab] = useState('deposit');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const [depositForm, setDepositForm] = useState({
    name: '', birthday: '', recordNo: '', item: ITEMS[0], quantity: 1, unit: '支', date: new Date().toISOString().split('T')[0]
  });

  const [searchForm, setSearchForm] = useState({ name: '', recordNo: '', birthday: '' });
  const [searchResults, setSearchResults] = useState([]);
  const [patientInfo, setPatientInfo] = useState(null);
  
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000); 
  };

  // 自動格式化生日 (YYYY-MM-DD)
  const handleBirthdayChange = (e, formType) => {
    let val = e.target.value.replace(/\D/g, ''); // 移除非數字
    let res = '';
    
    if (val.length > 0) res += val.substring(0, 4);
    if (val.length >= 5) res += '-' + val.substring(4, 6);
    if (val.length >= 7) res += '-' + val.substring(6, 8);

    if (formType === 'deposit') {
      setDepositForm({ ...depositForm, birthday: res });
    } else {
      setSearchForm({ ...searchForm, birthday: res });
    }
  };

  const requestGAS = async (params = {}, options = {}) => {
    const isPost = options.method === 'POST';
    const url = isPost ? GAS_URL : `${GAS_URL}?${new URLSearchParams(params).toString()}`;
    
    const fetchOptions = {
      method: isPost ? 'POST' : 'GET',
      mode: 'cors',
      credentials: 'omit'
    };

    if (isPost) {
      fetchOptions.body = JSON.stringify(params);
    }

    try {
      const response = await fetch(url, fetchOptions);
      if (!response.ok) throw new Error('伺服器回應錯誤');
      return await response.json();
    } catch (err) {
      console.error('GAS Request Error:', err);
      throw err;
    }
  };

  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await requestGAS({ action: 'deposit', data: depositForm }, { method: 'POST' });
      if (result.status === 'success') setShowPrintModal(true);
      else showMessage('error', `寄庫失敗: ${result.message}`);
    } catch (error) {
      showMessage('error', '網路連線失敗，請檢查 GAS 部署是否正確。');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchForm.name && !searchForm.recordNo && !searchForm.birthday) {
      return showMessage('error', '請輸入搜尋條件');
    }
    setLoading(true);
    setSearchResults([]);
    setPatientInfo(null);
    setSelectedRecordId('');
    setWithdrawAmount('');

    try {
      const result = await requestGAS({ 
        action: 'search', 
        name: searchForm.name, 
        recordNo: searchForm.recordNo, 
        birthday: searchForm.birthday 
      });
      
      if (result.status === 'success') {
        const validRecords = result.data.filter(record => record.remaining > 0).map(record => {
          let cleanDate = record.depositDate;
          if (cleanDate && cleanDate.includes('T')) {
            const d = new Date(cleanDate);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            cleanDate = `${year}-${month}-${day}`;
          }
          return { ...record, depositDate: cleanDate };
        });

        if(validRecords.length === 0) {
          if (result.data.length > 0) showMessage('error', '庫存已全數提領完畢');
          else showMessage('error', '查無寄庫資料');
        } else {
          setSearchResults(validRecords);
          setPatientInfo({ name: validRecords[0].name, birthday: validRecords[0].birthday, recordNo: validRecords[0].recordNo });
          setSelectedRecordId(validRecords[0].id);
        }
      } else {
        showMessage('error', `查詢失敗: ${result.message}`);
      }
    } catch (error) {
      showMessage('error', '搜尋功能連線失敗！');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    const targetRecord = searchResults.find(r => r.id === selectedRecordId);
    if (!targetRecord) return showMessage('error', '請選擇項目');
    const amount = parseInt(withdrawAmount);
    if (!amount || amount <= 0) return showMessage('error', '請輸入數量');
    if (amount > targetRecord.remaining) return showMessage('error', '提領量超過庫存');

    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await requestGAS({ action: 'withdraw', data: { id: selectedRecordId, amount: amount, date: today } }, { method: 'POST' });
      if (result.status === 'success') {
        showMessage('success', '提領成功！');
        const updated = searchResults.map(item => item.id === selectedRecordId ? { ...item, remaining: item.remaining - amount } : item).filter(item => item.remaining > 0);
        setSearchResults(updated);
        setWithdrawAmount('');
        if (updated.length > 0 && !updated.find(r => r.id === selectedRecordId)) setSelectedRecordId(updated[0].id);
        else if (updated.length === 0) setPatientInfo(null);
      } else {
        showMessage('error', `提領失敗: ${result.message}`);
      }
    } catch (error) {
      showMessage('error', '網路錯誤：提領失敗。');
    } finally {
      setLoading(false);
    }
  };

  const selectedRecordDetails = searchResults.find(r => r.id === selectedRecordId);

  return (
    <div className="min-h-screen bg-blue-50 p-4 md:p-8 font-sans print:bg-white print:p-0">
      <style>
        {`
          /* 絕對鎖死 A6 尺寸與邊界 */
          @media print {
            @page { 
              size: 105mm 148mm; /* A6 實體紙張尺寸 */
              margin: 0mm;       /* 強制瀏覽器邊距歸零 */
            }
            html, body {
              width: 105mm;
              height: 148mm;
              margin: 0;
              padding: 0;
              background: white;
            }
            body { 
              -webkit-print-color-adjust: exact; 
              print-color-adjust: exact; 
            }
          }
        `}
      </style>

      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden print:shadow-none print:rounded-none">
        
        {/* Header - 使用深海藍 */}
        <div className={`bg-blue-900 text-white p-6 flex justify-between items-center print:bg-white print:text-black print:border-b-2 print:border-blue-900 print:pb-4 ${showReceiptPreview ? 'hidden print:flex' : ''}`}>
          <div className="flex items-center gap-3">
            <img 
              src="/澤仁logo.png" 
              alt="澤仁logo" 
              className="h-9 w-auto object-contain print:h-8" 
              onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }} 
            />
            <h1 className="text-2xl font-bold tracking-wider">呈安藥局-藥品寄庫系統</h1>
          </div>
        </div>

        {showPrintModal && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex justify-center items-center print:hidden backdrop-blur-sm">
            <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-[450px] w-full mx-4 border-2 border-blue-500 transform transition-all">
              <div className="flex items-center gap-3 text-blue-900 mb-4">
                <CheckCircle2 size={32} />
                <h3 className="text-xl font-bold text-gray-800">寄庫成功！</h3>
              </div>
              <p className="text-gray-600 mb-6 text-lg">資料已寫入系統。是否要列印本次的「寄庫證明聯」？</p>
              <div className="flex gap-3 justify-end flex-wrap">
                <button onClick={() => { setShowPrintModal(false); showMessage('success', '寄庫完成！'); setDepositForm({ ...depositForm, name: '', recordNo: '', quantity: 1, item: ITEMS[0] }); }} className="px-4 py-2.5 rounded-lg font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition">完成(不列印)</button>
                <button onClick={() => { setShowPrintModal(false); setShowReceiptPreview(true); }} className="px-4 py-2.5 rounded-lg font-bold text-blue-900 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition">預覽證明聯</button>
                <button onClick={() => { window.print(); setTimeout(() => { setShowPrintModal(false); setDepositForm({ ...depositForm, name: '', recordNo: '', quantity: 1, item: ITEMS[0] }); }, 500); }} className="px-4 py-2.5 rounded-lg font-bold text-white bg-blue-900 hover:bg-blue-800 flex items-center gap-2 shadow-md transition-all active:scale-95"><Printer size={18} /> 列印</button>
              </div>
            </div>
          </div>
        )}

        {message && (
          <div className={`p-4 flex items-center gap-2 text-white font-medium print:hidden ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
            {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            {message.text}
          </div>
        )}

        {/* 標籤頁 */}
        <div className={`flex border-b border-gray-200 print:hidden ${showReceiptPreview ? 'hidden' : ''}`}>
          <button className={`flex-1 py-4 text-lg font-medium flex justify-center items-center gap-2 transition-colors ${activeTab === 'deposit' ? 'text-blue-900 border-b-2 border-blue-900 bg-blue-50' : 'text-gray-500 hover:text-blue-900 hover:bg-gray-50'}`} onClick={() => setActiveTab('deposit')}><PlusCircle size={20} /> 寄庫藥品</button>
          <button className={`flex-1 py-4 text-lg font-medium flex justify-center items-center gap-2 transition-colors ${activeTab === 'withdraw' ? 'text-blue-900 border-b-2 border-blue-900 bg-blue-50' : 'text-gray-500 hover:text-blue-900 hover:bg-gray-50'}`} onClick={() => setActiveTab('withdraw')}><MinusCircle size={20} /> 提領藥品</button>
        </div>

        <div className="p-6 md:p-8 relative min-h-[400px]">
          {loading && (
            <div className="absolute inset-0 bg-white/70 flex justify-center items-center z-10 print:hidden">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
            </div>
          )}

          {activeTab === 'deposit' && (
            <div className="animate-fade-in">
              <form onSubmit={handleDepositSubmit} className={`space-y-6 print:hidden ${showReceiptPreview ? 'hidden' : 'block'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-gray-700 font-medium">姓名</label>
                    <input type="text" required value={depositForm.name} onChange={e => setDepositForm({...depositForm, name: e.target.value})} className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-gray-700 font-medium">生日</label>
                    <input 
                      type="text" 
                      placeholder="YYYY-MM-DD"
                      maxLength="10"
                      required 
                      value={depositForm.birthday} 
                      onChange={e => handleBirthdayChange(e, 'deposit')} 
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-gray-700 font-medium">藥局病歷號</label>
                    <input type="text" required value={depositForm.recordNo} onChange={e => setDepositForm({...depositForm, recordNo: e.target.value})} className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-gray-700 font-medium">寄庫日期</label>
                    <input type="date" required value={depositForm.date} onChange={e => setDepositForm({...depositForm, date: e.target.value})} className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-6 mt-6 flex flex-col md:flex-row gap-6">
                  <div className="flex-1 flex flex-col gap-2">
                    <label className="text-gray-700 font-medium">寄庫品項</label>
                    <select value={depositForm.item} onChange={e => setDepositForm({...depositForm, item: e.target.value})} className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                      {ITEMS.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  <div className="w-full md:w-32 flex flex-col gap-2">
                    <label className="text-gray-700 font-medium">數量</label>
                    <input type="number" min="1" required value={depositForm.quantity} onChange={e => setDepositForm({...depositForm, quantity: parseInt(e.target.value)})} className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                </div>
                <div className="pt-4 flex justify-end">
                  <button type="submit" className="bg-blue-900 text-white px-8 py-3 rounded-lg font-bold text-lg hover:bg-blue-800 shadow-lg flex items-center gap-2 transition-all active:scale-95">
                    <PlusCircle size={20} /> 確定寄庫
                  </button>
                </div>
              </form>

              {/* 單聯排版：鎖死 A6 精準尺寸 */}
              <div className={`${showReceiptPreview ? 'block mt-4' : 'hidden print:block'}`}>
                <div className="bg-white mx-auto border border-gray-300 print:border-none print:w-[105mm] print:h-[148mm] w-[105mm] h-[148mm] p-4 print:p-[5mm] flex flex-col justify-start overflow-hidden shadow-sm print:shadow-none box-border relative">
                  
                  <h2 className="text-base md:text-lg font-bold text-center mb-3 pb-1 border-b border-gray-300 text-black mt-1">呈安藥局-藥品寄庫證明聯</h2>
                  
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] mb-2.5 text-black">
                    <div className="flex items-end gap-1"><span className="text-gray-600 whitespace-nowrap">姓名:</span><strong className="border-b border-gray-300 flex-1 truncate">{depositForm.name}</strong></div>
                    <div className="flex items-end gap-1"><span className="text-gray-600 whitespace-nowrap">病歷號:</span><strong className="border-b border-gray-300 flex-1 truncate font-mono">{depositForm.recordNo}</strong></div>
                    <div className="flex items-end gap-1"><span className="text-gray-600 whitespace-nowrap">日期:</span><strong className="border-b border-gray-300 flex-1">{depositForm.date}</strong></div>
                    <div className="flex items-end gap-1"><span className="text-gray-600 whitespace-nowrap">生日:</span><strong className="border-b border-gray-300 flex-1">{depositForm.birthday}</strong></div>
                  </div>

                  <div className="bg-gray-50 px-2 py-1.5 rounded border border-gray-200 mb-2.5 flex justify-between items-center text-[10px]">
                    <span className="text-gray-600">寄庫品項與數量:</span>
                    <strong className="text-black truncate ml-1 text-[11px]">{depositForm.item} × {depositForm.quantity}{depositForm.unit}</strong>
                  </div>

                  <div className="mb-2">
                    <table className="w-full text-[10px] border-collapse border border-black text-center table-fixed text-black">
                      <thead>
                        <tr className="bg-gray-100 h-[26px]">
                          <th className="border border-black font-semibold w-[25%]">提領日期</th>
                          <th className="border border-black font-semibold w-[25%]">提領數量</th>
                          <th className="border border-black font-semibold w-[25%]">剩餘數量</th>
                          <th className="border border-black font-semibold w-[25%]">操作人員</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...Array(8)].map((_, i) => (
                          <tr key={i} className="h-[26px]">
                            <td className="border border-black"></td>
                            <td className="border border-black"></td>
                            <td className="border border-black"></td>
                            <td className="border border-black"></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="flex justify-end px-2 pb-1">
                    <div className="border border-dashed border-gray-300 shrink-0 w-12 h-12 flex items-center justify-center">
                      <span className="text-[10px] font-bold leading-tight text-gray-300 text-center block">藥師<br/>簽章</span>
                    </div>
                  </div>

                  <div className="mt-auto pt-2 border-t border-gray-300 text-[9px] text-gray-700 leading-tight pb-1">
                    <div className="font-bold mb-1 text-black">注意事項：</div>
                    <ol className="list-decimal pl-3 space-y-1">
                      <li>本單據請妥善保管，不慎遺失者領取剩餘藥物時需於官方LINE上留下領藥證明以避免後續爭議</li>
                      <li>寄庫剩餘藥品領取完畢後，本單據會收回</li>
                    </ol>
                  </div>

                </div>

                {showReceiptPreview && (
                  <div className="mt-8 pt-6 border-t border-dashed border-gray-300 text-center print:hidden flex flex-col items-center gap-4">
                    <button onClick={() => { setShowReceiptPreview(false); showMessage('success', '預覽完成！'); setDepositForm({ ...depositForm, name: '', recordNo: '', quantity: 1, item: ITEMS[0] }); }} className="bg-blue-900 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-800 transition-all shadow-md">預覽完成並清空</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'withdraw' && (
            <div className="space-y-6 animate-fade-in">
              <form onSubmit={handleSearch} className="bg-gray-50 p-6 rounded-xl border border-gray-200 print:hidden shadow-sm">
                <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2"><Search size={18}/> 搜尋寄庫資料 (可單欄搜尋或組合搜尋)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600">姓名</label>
                    <input type="text" value={searchForm.name} onChange={(e) => setSearchForm({...searchForm, name: e.target.value})} className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="輸入姓名" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600">病歷號</label>
                    <input type="text" value={searchForm.recordNo} onChange={(e) => setSearchForm({...searchForm, recordNo: e.target.value})} className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="輸入病歷號" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600">生日</label>
                    <input 
                      type="text" 
                      placeholder="YYYY-MM-DD"
                      maxLength="10"
                      value={searchForm.birthday} 
                      onChange={(e) => handleBirthdayChange(e, 'search')} 
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button type="submit" className="bg-blue-900 text-white px-8 py-2 rounded-lg font-bold hover:bg-blue-800 flex items-center gap-2 shadow transition-all active:scale-95">
                    <Search size={18} /> 開始搜尋
                  </button>
                </div>
              </form>

              {patientInfo && searchResults.length > 0 && (
                <div className="mt-8 bg-white border border-blue-200 rounded-xl overflow-hidden shadow-lg animate-fade-in">
                  <div className="bg-blue-50 p-5 border-b border-blue-100 flex flex-wrap gap-6 items-center">
                    <div className="flex items-center gap-2 text-blue-900"><User size={24} /><span className="font-bold text-xl">{patientInfo.name}</span></div>
                    <div className="text-gray-600">病歷號: <span className="font-mono font-bold text-black">{patientInfo.recordNo}</span></div>
                    <div className="text-gray-600">生日: <span className="font-bold text-black">{patientInfo.birthday}</span></div>
                  </div>
                  <form onSubmit={handleWithdraw} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-2 space-y-2">
                        <label className="block text-gray-700 font-bold">選擇要提領的寄庫紀錄</label>
                        <select value={selectedRecordId} onChange={e => setSelectedRecordId(e.target.value)} className="w-full px-4 py-4 rounded-xl border-2 border-blue-200 bg-white text-lg font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {searchResults.map((record) => (
                            <option key={record.id} value={record.id}>[{record.depositDate}] {record.item} (剩餘 {record.remaining}{record.unit})</option>
                          ))}
                        </select>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <div className="flex justify-between mb-2"><label className="font-bold">本次提領數量</label>{selectedRecordDetails && <span className="text-blue-700 text-sm font-bold underline">庫存: {selectedRecordDetails.remaining}</span>}</div>
                        <div className="flex items-center gap-2">
                          <input type="number" min="1" max={selectedRecordDetails?.remaining || 1} required value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-gray-300 text-center text-xl font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                          <span className="text-gray-600 font-bold">支</span>
                        </div>
                      </div>
                    </div>
                    <div className="pt-4 flex justify-end"><button type="submit" className="bg-red-500 text-white px-10 py-3 rounded-lg font-bold text-lg hover:bg-red-600 shadow-lg flex items-center gap-2 transition-all active:scale-95"><MinusCircle size={20} /> 確認提領並扣庫存</button></div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
