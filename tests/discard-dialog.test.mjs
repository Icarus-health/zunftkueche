import './react-loader.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
const {DialogPortal, isolateDialogBackground} = await import('../src/components/DiscardChangesDialog.tsx');
test('confirmation placed in a price label portals its buttons into the body instead of the label', () => {
  const body = {nodeType:1}, priceLabel = {nodeType:1};
  const original = globalThis.document;
  globalThis.document = {body};
  try {
    const button = React.createElement('button',null,'Weiterarbeiten');
    const portal = DialogPortal({children:button});
    const label = React.createElement('label',null,'Einkaufspreis netto je Kg',portal);
    assert.equal(portal.$$typeof,Symbol.for('react.portal'));
    assert.equal(portal.containerInfo,body);
    assert.notEqual(portal.containerInfo,priceLabel);
    assert.equal(label.props.children[1].children.props.children,'Weiterarbeiten');
  } finally {globalThis.document = original;}
});
test('background isolation keeps the confirmation interactive and restores existing inert states', () => {
  const app = {inert:false}, previouslyInert = {inert:true}, layer = {inert:false};
  layer.parentElement = {children:[app,previouslyInert,layer]};
  const restore = isolateDialogBackground(layer);
  assert.equal(app.inert,true); assert.equal(previouslyInert.inert,true); assert.equal(layer.inert,false);
  restore(); assert.equal(app.inert,false); assert.equal(previouslyInert.inert,true);
});
