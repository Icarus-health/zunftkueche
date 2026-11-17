import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hostIsDark,applyHostTheme} from '../src/kitchen/host-theme.ts';

test('light or dark follows the host: SharePoint by its inverted theme, Teams by its own design',()=>{
 assert.equal(hostIsDark(undefined),false,'no theme service: light');
 assert.equal(hostIsDark(false),false);
 assert.equal(hostIsDark(true),true,'dark section or page background in SharePoint');
 assert.equal(hostIsDark(false,'dark'),true,'Teams dark wins over a light SharePoint theme');
 assert.equal(hostIsDark(false,'contrast'),true,'Teams high contrast is a dark design');
 assert.equal(hostIsDark(true,'default'),false,'Teams light wins as well');
});

test('the decision is written to the root element, the stylesheet switches every colour role from there',()=>{
 const root={dataset:{}};
 applyHostTheme(root,true); assert.equal(root.dataset.dark,'true');
 applyHostTheme(root,false,'default'); assert.equal(root.dataset.dark,'false');
 const css=readFileSync(new URL('../src/webparts/kitchen/KitchenWebPart.module.scss',import.meta.url),'utf8');
 assert.match(css,/\.kitchen\[data-dark='true'\]\s*\{\s*color-scheme: dark;/);
 const manifest=JSON.parse(readFileSync(new URL('../src/webparts/kitchen/KitchenWebPart.manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.supportsThemeVariants,true);
 const part=readFileSync(new URL('../src/webparts/kitchen/KitchenWebPart.ts',import.meta.url),'utf8');
 assert.match(part,/ThemeProvider\.serviceKey/); assert.match(part,/registerOnThemeChangeHandler/);
});

test('colours live in roles only: after the token blocks the stylesheet names no fixed colour except the hero button',()=>{
 const css=readFileSync(new URL('../src/webparts/kitchen/KitchenWebPart.module.scss',import.meta.url),'utf8');
 const lines=css.split('\n');
 const fixed=lines.map((l,i)=>[i+1,l]).filter(([,l])=>/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(l)&&!/^\s*--[a-z0-9-]+:/.test(l)&&!/^\s*(\/\*|\*|\/\/)/.test(l));
 const allowed=fixed.filter(([,l])=>/box-shadow|rgba\(0, 0, 0, 0\.1[0-9]\)|0 [0-9]+px [0-9]+px rgba/.test(l)||/background: #fff;|color: #353b80;|background: #eceefa;|outline-color: #fff;/.test(l));
 assert.deepEqual(fixed.filter(x=>!allowed.includes(x)).map(([n,l])=>n+': '+l.trim()),[]);
});
