import dotenv from'dotenv';dotenv.config({quiet:true});
import fs from'node:fs/promises';import{createClient}from'@nodeops-createos/sandbox';
const origin=process.env.CARTPILOT_TEST_URL||'https://hackathon-cartpilot-advay.tyzo.nodeops.app';
const{id}=JSON.parse(await fs.readFile('.rehearsal/cart-sandbox.json','utf8'));
const box=await createClient({apiKey:process.env.CREATEOS_PROJECT_API_KEY,retry:false}).getSandbox(id);
if(box.status==='pausing')await box.waitUntilPaused({timeoutMs:240000});
if(box.status==='paused')await box.resume();await box.waitUntilRunning({timeoutMs:180000});
await box.setEgress([new URL(origin).hostname+':443','fonts.googleapis.com:443','fonts.gstatic.com:443','api.sb.createos.sh:443']);
try{
const browserOrigin=origin===box.previewUrl(4173)?'http://127.0.0.1:4173':origin;
const code=`import json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,args=['--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('${browserOrigin}',wait_until='networkidle')
 page.get_by_role('button',name='Plan my basket').wait_for()
 page.screenshot(path='/tmp/cartpilot/qa-desktop.png',full_page=True)
 assert page.locator('body').evaluate('e=>e.scrollWidth<=window.innerWidth'),'Desktop overflow'
 page.get_by_role('button',name='Open wallet',exact=True).click()
 page.screenshot(path='/tmp/cartpilot/qa-wallet.png',full_page=False)
 page.goto('${browserOrigin}/?merchant=flash',wait_until='networkidle')
 page.wait_for_selector('[data-sku]')
 assert page.locator('[data-sku]').count()==36,'Merchant SKU count'
 page.screenshot(path='/tmp/cartpilot/qa-merchant.png',full_page=False)
 page.set_viewport_size({'width':390,'height':844})
 page.goto('${browserOrigin}',wait_until='networkidle')
 page.screenshot(path='/tmp/cartpilot/qa-mobile.png',full_page=True)
 assert page.locator('body').evaluate('e=>e.scrollWidth<=window.innerWidth'),'Mobile overflow'
 assert not errors, str(errors)
 print(json.dumps({'browser':'Chromium in CreateOS','pageErrors':errors,'merchantProducts':36,'desktopAndMobileOverflow':False}))
 b.close()
`;
await box.files.upload('/tmp/cartpilot/browser-qa.py',code);
const{result}=await box.runCommand('python3',['-I','/tmp/cartpilot/browser-qa.py'],{timeoutMs:90000});
console.log(JSON.stringify(result));
await fs.mkdir('.rehearsal/screenshots',{recursive:true});
for(const name of ['desktop','wallet','merchant','mobile']){try{await fs.writeFile('.rehearsal/screenshots/'+name+'.png',Buffer.from(await box.files.download('/tmp/cartpilot/qa-'+name+'.png')));}catch{}}
if(result.exit_code!==0)process.exitCode=1;
}finally{await box.setEgress(['api.sb.createos.sh:443']);}
process.exit(process.exitCode||0);
