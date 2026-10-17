"""Observe public demo merchant pages. No customer session or payment credentials."""
import json,sys
from playwright.sync_api import sync_playwright
origin=sys.argv[1].rstrip('/');output=sys.argv[2];offers=[];screens=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1280,'height':900},device_scale_factor=1)
    for merchant in ['flash','fresh','corner']:
        page.goto(origin+'/?merchant='+merchant,wait_until='networkidle',timeout=30000)
        page.wait_for_selector('[data-sku]',timeout=15000)
        rows=page.locator('[data-sku]').evaluate_all("els=>els.map(e=>({merchantId:e.dataset.merchant,productId:e.dataset.sku,price:Number(e.dataset.price),stock:Number(e.dataset.stock)}))")
        offers.extend(rows)
        screenshot=output+'.'+merchant+'.png';page.screenshot(path=screenshot,full_page=False);screens.append(screenshot)
        print(json.dumps({'event':'browser_observation','merchant':merchant,'productsObserved':len(rows)}),flush=True)
    browser.close()
json.dump({'offers':offers,'screenshots':screens},open(output,'w'))
