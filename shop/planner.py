"""Bundled reference planner. AI-generated planners use the same input/output contract."""
import json, sys, math
data=json.load(open(sys.argv[1]));task=data['task'];candidates=[]
for merchant in data['merchants']:
    if merchant['eta']>task['maxDeliveryMinutes']:continue
    selected={};feasible=True
    for slot in task['slots']:
        choices=[]
        for offer in data['offers']:
            if offer['merchantId']!=merchant['id']:continue
            product=next((p for p in data['products'] if p['id']==offer['productId']),None)
            if not product or product['category']!=slot['category']:continue
            if any(a in task['avoid'] for a in product['allergens']):continue
            if task.get('vegan') and 'vegan' not in product['tags']:continue
            quantity=math.ceil(slot['servings']/product['servings'])
            if quantity>offer['stock']:continue
            choices.append((offer['price']*quantity,product['id'],quantity))
        if not choices:feasible=False;break
        price,pid,quantity=min(choices);selected[pid]=max(selected.get(pid,0),quantity)
    if not feasible:continue
    subtotal=sum(next(o['price'] for o in data['offers'] if o['merchantId']==merchant['id'] and o['productId']==pid)*q for pid,q in selected.items())
    # JavaScript Math.round for positive minor-unit values.
    total=subtotal+math.floor(subtotal*.085+.5)+merchant['deliveryFee']+merchant['serviceFee']
    if total<=task['budgetCents']:
        candidates.append({'merchantId':merchant['id'],'items':[{'productId':pid,'quantity':q} for pid,q in selected.items()],'reasoning':f"Covers every requested category for {task['servings']} people, within the full budget including fees.",'estimatedTotal':total,'eta':merchant['eta']})
if not candidates:
    print(json.dumps({'error':'No merchant can satisfy this basket within the budget, dietary rules and delivery window.'}));sys.exit(2)
candidates.sort(key=lambda x:(x['estimatedTotal'],x['eta']))
result={'best':candidates[0],'alternatives':candidates}
json.dump(result,open(sys.argv[2],'w'));print(json.dumps({'merchantsCompared':len(data['merchants']),'feasibleBaskets':len(candidates),'selected':candidates[0]['merchantId'],'message':'Basket optimization completed.'}))
