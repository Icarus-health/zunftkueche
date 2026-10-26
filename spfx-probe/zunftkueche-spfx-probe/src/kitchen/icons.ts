// Microsoft Fluent UI MDL2 icon mappings and unmodified font subsets, MIT licensed.
// Fonts are bundled with the app; no external font service is required.
const glyphs:Record<string,[string,string]>={home:['1','E80F'],cart:['1','E7BF'],package:['1','E7B8'],chart:['3','E9EC'],truck:['5','EBF4'],count:['9','F0E3'],calendar:['base','E787'],settings:['base','E713'],info:['base','E946'],chevron:['base','E76C'],search:['base','E721']};
export function icon(name:string):string{const item=glyphs[name]||glyphs.info;return `<span class="zk-icon font-${item[0]}" aria-hidden="true">&#x${item[1]};</span>`;}
