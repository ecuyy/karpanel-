import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';
const repo = process.argv[2];
const outputDir = process.argv[3];
if (!repo || !outputDir) throw Error('Pass absolute repository and output directory paths. Run using the Codex primary runtime in a temporary working directory.');
const wb = Workbook.create();
const s = wb.worksheets.add('Ürün Kârı');
s.showGridLines = false;
s.tabColor = '#9C4B10';
s.getRange('A1:G31').format.font = {name:'Arial',size:11,color:'#241D17'};
s.getRange('A1:G31').format.rowHeight = 25;
s.getRange('A1:G31').format.verticalAlignment = 'center';
s.getRange('A1:A31').format.columnWidth = 3;
s.getRange('B1:B31').format.columnWidth = 22;
s.getRange('C1:C31').format.columnWidth = 36;
s.getRange('D1:D31').format.columnWidth = 4;
s.getRange('E1:E31').format.columnWidth = 31;
s.getRange('F1:F31').format.columnWidth = 22;
s.getRange('G1:G31').format.columnWidth = 3;
const value = (cell,v) => s.getRange(cell).values=[[v]];
const formula = (cell,f) => s.getRange(cell).formulas=[[f]];
value('B2','Trendyol ürün kârı');
s.getRange('B2').format.font = {name:'Arial',size:16,bold:true,color:'#9C4B10'};
value('B3','KomisyonHesap ücretsiz Excel örneği');
value('E2','komisyonhesap.com');
value('C5','Net kâr / zarar (TL)');value('C6','Kâr marjı');value('C7','Yatırım getirisi');
formula('B5','=IF(B15<>"Hazır","",B11-SUM(F12:F16)-F24)');
formula('B6','=IF(B15<>"Hazır","",B5/B11)');
formula('B7','=IF(B15<>"Hazır","",B5/B12)');
s.getRange('B5:C7').format.fill='#FFF3E5';
s.getRange('B5:B7').format.font={name:'Arial',size:14,bold:true,color:'#241D17'};
s.getRange('B5').setNumberFormat('#,##0.00;[Red](#,##0.00);0.00');
s.getRange('B6:B7').setNumberFormat('0.00%;[Red](0.00%);0.00%');
value('B9','Ürün başına girdiler');value('C9','Sarı hücreleri değiştirin');
s.getRange('B9:C9').format.fill='#F0E8DD';
s.getRange('B11:B14').values=[[1000],[500],[20],[60]];
s.getRange('C11:C15').values=[['Satış fiyatı, KDV dahil (TL)'],['Alış maliyeti, KDV dahil (TL)'],['Komisyon oranı (% sayı: 20)'],['Kargo, KDV dahil (TL)'],['Girdi kontrolü']];
s.getRange('B11:B14').format.fill='#FFF1B8';
s.getRange('B11:B14').format.font={name:'Arial',size:11,color:'#174FBA'};
s.getRange('B11:B14').setNumberFormat('#,##0.00');
formula('B15','=IF(AND(COUNT(B11:B14)=4,B11>0,B12>0,B13>=0,B13<=100,B14>=0),"Hazır","Girdileri kontrol edin")');
value('B17',1.2);value('C17','KDV katsayısı (%20)');
value('B18',13.19);value('C18','Hizmet bedeli, KDV dahil (TL)');
value('B19',0.01);value('C19','E-ticaret stopajı varsayımı');
s.getRange('B17:B18').setNumberFormat('0.00');s.getRange('B19').setNumberFormat('0%');
value('E9','Satıştan net kâra');value('F9','Tutar (TL)');
s.getRange('E9:F9').format.fill='#F0E8DD';
const rows=[
 [11,'Satış tutarı','B11'],[12,'Alış maliyeti','B12'],[13,'Komisyon, KDV dahil','B11*B13/100'],
 [14,'Kargo','B14'],[15,'Hizmet bedeli','B18'],[16,'Stopaj','B11/B17*B19'],
 [18,'Satış KDV','B11-B11/B17'],[19,'Alış KDV','B12-B12/B17'],
 [20,'Komisyon KDV','F13-F13/B17'],[21,'Kargo KDV','B14-B14/B17'],
 [22,'Hizmet bedeli KDV','B18-B18/B17'],[24,'Ödenecek KDV','MAX(0,F18-SUM(F19:F22))']
];
for(const [r,label,f] of rows){value('E'+r,label);formula('F'+r,'=IF($B$15<>"Hazır","",'+f+')');}
s.getRange('F11:F24').setNumberFormat('#,##0.00;[Red](#,##0.00);0.00');
s.getRange('B5:B7').conditionalFormats.add('cellIs',{operator:'lessThan',formula:0,format:{font:{color:'#B42318'}}});
value('B22','Örnek değerlerdir. Kendi panelinizdeki oranı girin.');
value('B23','Komisyon oranını KDV dahil toplam oran olarak girin.');
value('B25','Hesap, sitedeki ürün analiziyle aynı %20 KDV ve 13,19 TL hizmet bedelini kullanır.');
value('B26','Reklam, paketleme, iade ve sabit işletme giderleri ayrıca değerlendirilir.');
value('B27','Stopaj bu hesapta nakit kesintisidir. Dönemsel vergi mahsubunu içermez.');
value('B29','Kaynak ve çevrimiçi hesap: https://komisyonhesap.com/trendyol-komisyon-hesaplama');
value('B30','Çok sayıda ürün için: https://komisyonhesap.com/?trial=1&from=excel_template');
const app=await fs.readFile(repo+'/karpanel.html','utf8');
const calc=vm.runInNewContext('('+app.match(/function calcKar\(p\)\{[\s\S]*?\n\}/)[0]+')');
let tests=0;
for(const sale of [0.01,299.9,1000,1234.56]) for(const cost of [1,150.25,1500]) for(const rate of [0,12.75,20,100]) for(const shipping of [0,60,99.9]){
 s.getRange('B11:B14').values=[[sale],[cost],[rate],[shipping]];
 const ref=calc({salePrice:sale,alis:cost,commissionRate:rate,kargo:shipping});
 assert(Math.abs(s.getRange('B5').values[0][0]-ref.net)<1e-8);
 tests++;
}
for(const blank of [null,0,-1]){value('B11',blank);assert.equal(s.getRange('B5').values[0][0],'');}
s.getRange('B11:B14').values=[[1000],[500],[20],[60]];
wb.recalculate();
console.log('Verified '+tests+' formula cases; example net='+s.getRange('B5').values[0][0]);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:10},maxChars:1000})).ndjson);
await fs.mkdir(outputDir,{recursive:true});
const preview=await wb.render({sheetName:s.name,range:'A1:G31',scale:1.4,format:'png'});
await fs.writeFile(outputDir+'/excel-preview.png',new Uint8Array(await preview.arrayBuffer()));
await (await SpreadsheetFile.exportXlsx(wb)).save(outputDir+'/trendyol-kar-hesaplama-ornek.xlsx');
await fs.mkdir(repo+'/downloads',{recursive:true});
await fs.copyFile(outputDir+'/trendyol-kar-hesaplama-ornek.xlsx',repo+'/downloads/trendyol-kar-hesaplama-ornek.xlsx');
