'use strict';
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');

// Keep the complete stylesheet as the source of truth. Only the initial HTML
// receives a conservative subset: public sections and dialogs, all media rules,
// global declarations and animations. Application styles load independently.
function criticalStyles(html, css) {
  const start = html.indexOf('<!-- APP BÖLÜMÜ -->');
  const end = html.indexOf('<!-- İLETİŞİM -->', start);
  if (start < 0 || end < start) throw new Error('Public/application boundaries missing');
  const publicHTML = (html.slice(0, start) + html.slice(end))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const classes = new Set(['open','active','on','show','error','success','play','cycling']);
  const ids = new Set();
  for (const match of publicHTML.matchAll(/\bclass="([^"]*)"/g)) {
    for (const name of match[1].split(/\s+/)) classes.add(name);
  }
  for (const match of publicHTML.matchAll(/\bid="([^"]*)"/g)) ids.add(match[1]);
  const tree = postcss.parse(css);
  tree.walkComments(comment => comment.remove());
  tree.walkRules(rule => {
    for (let parent=rule.parent;parent;parent=parent.parent) {
      if (parent.type==='atrule' && /keyframes$/i.test(parent.name)) return;
    }
    const selectors = selectorParser().astSync(rule.selector);
    // Only positive, top-level class/id requirements can rule out a match.
    // Functional pseudo-classes (:not/:is/:has) remain conservative.
    const possible = selectors.nodes.some(selector => selector.nodes.every(node =>
      node.type==='class' ? classes.has(node.value) : node.type==='id' ? ids.has(node.value) : true));
    if (!possible) rule.remove();
  });
  // Walk from the inside out so empty media/supports wrappers disappear too.
  const wrappers=[];tree.walkAtRules(rule=>wrappers.push(rule));
  wrappers.reverse().forEach(rule=>{if(rule.nodes && !rule.nodes.length)rule.remove();});
  return tree.toString();
}
module.exports = {criticalStyles};
