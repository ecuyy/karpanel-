const {test}=require('node:test');const assert=require('node:assert/strict');
const {criticalStyles}=require('./critical-styles');
test('critical CSS preserves public styles, media queries, dialogs and functional pseudo classes',()=>{
 const html='<div class="hero khm"><h1 id="headline">Title</h1></div><!-- APP BÖLÜMÜ --><div class="panel-only" id="private-panel"></div><!-- İLETİŞİM --><div class="auth-box open" id="auth-overlay"></div>';
 const css=':root{--x:red}body{margin:0}.hero h1{color:red}.panel-only{padding:99px}#private-panel{display:grid}.hero,.panel-only{line-height:1.2}.hero:not(.app-mode){color:blue}.auth-box.open{display:flex}@media(max-width:760px){.hero{font-size:30px}.panel-only{color:red}}@keyframes move{0%{opacity:0}100%{opacity:1}}@supports(display:grid){.panel-only{display:grid}}';
 const result=criticalStyles(html,css);
 assert.match(result,/:root\{--x:red\}/);assert.match(result,/\.hero h1\{color:red\}/);
 assert.match(result,/\.hero:not\(\.app-mode\)/);assert.match(result,/\.auth-box.open/);assert.match(result,/@media\(max-width:760px\)/);assert.match(result,/@keyframes move/);
 assert(!result.includes('padding:99px'));assert(!result.includes('#private-panel'));assert(!result.includes('@supports'));
 assert.match(result,/\.hero,\.panel-only\{line-height:1.2\}/);
});
test('missing public boundaries reject extraction so delivery can retain the full stylesheet',()=>{
 assert.throws(()=>criticalStyles('<body>plain</body>','body{color:red}'),/boundaries/);
});
