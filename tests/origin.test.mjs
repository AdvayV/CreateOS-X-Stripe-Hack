import test from'node:test';import assert from'node:assert/strict';
import{requestOriginAllowed}from'../server/cart/origin.mjs';
const publicOrigin='https://demo.app.sb.createos.sh';
test('Configured public origin works when ingress rewrites Host',()=>{
  assert.equal(requestOriginAllowed({origin:publicOrigin,host:'127.0.0.1:4173'},publicOrigin),true);
});
test('Another site cannot submit through the public ingress',()=>{
  assert.equal(requestOriginAllowed({origin:'https://attacker.example',host:'127.0.0.1:4173'},publicOrigin),false);
});
test('A spoofed forwarded host does not grant origin access',()=>{
  assert.equal(requestOriginAllowed({origin:'https://attacker.example',host:'127.0.0.1:4173','x-forwarded-host':'attacker.example'},publicOrigin),false);
});
test('Direct local development requires matching host and port',()=>{
  assert.equal(requestOriginAllowed({origin:'http://localhost:4173',host:'localhost:4173'}),true);
  assert.equal(requestOriginAllowed({origin:'http://localhost:4174',host:'localhost:4173'}),false);
});
test('Malformed and null origins fail closed',()=>{
  for(const origin of ['null',publicOrigin+'/extra','not a url',publicOrigin+'@attacker.example',undefined]){
    if(origin!==undefined)assert.equal(requestOriginAllowed({origin,host:'localhost:4173'},publicOrigin),false);
  }
  assert.equal(requestOriginAllowed({origin:publicOrigin},'invalid URL'),false);
});
test('CLI requests without Origin remain supported',()=>{
  assert.equal(requestOriginAllowed({host:'localhost:4173'},publicOrigin),true);
});
