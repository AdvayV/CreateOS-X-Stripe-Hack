import { createHash } from 'node:crypto';
export function verifyBasket(candidate, input) {
  const checks=[]; const add=(name,pass,detail)=>checks.push({name,passed:!!pass,detail});
  const merchant=input.merchants.find(x=>x.id===candidate.merchantId);
  add('Known merchant',!!merchant,candidate.merchantId);
  const lines=[]; let subtotal=0;
  const seen=new Set();
  for(const line of candidate.items??[]) {
    const product=input.products.find(x=>x.id===line.productId),offer=input.offers.find(x=>x.productId===line.productId&&x.merchantId===candidate.merchantId);
    const valid=!!product&&!!offer&&Number.isSafeInteger(line.quantity)&&line.quantity>0&&line.quantity<=12&&!seen.has(line.productId);
    add('Valid catalog item & quantity',valid,line.productId);seen.add(line.productId);if(!valid)continue;
    add('In stock',offer.stock>=line.quantity,`${product.name}: ${offer.stock} available`);
    const allergens=product.allergens.filter(x=>input.task.avoid.includes(x));
    add('Dietary exclusions respected',!allergens.length,allergens.length?`${product.name}: ${allergens.join(', ')}`:`${product.name}: no excluded ingredient in demo metadata`);
    if(input.task.vegan)add('Vegan preference',product.tags.includes('vegan'),product.name);
    subtotal+=offer.price*line.quantity;
    lines.push({...line,product,unitPrice:offer.price,lineTotal:offer.price*line.quantity});
  }
  for(const slot of input.task.slots) {
    const servings=lines.filter(l=>l.product.category===slot.category).reduce((sum,l)=>sum+l.quantity*l.product.servings,0);
    add(`Enough ${slot.label}`,servings>=slot.servings,`${servings}/${slot.servings} servings`);
  }
  const tax=Math.round(subtotal*.085),delivery=merchant?.deliveryFee??0,service=merchant?.serviceFee??0,total=subtotal+tax+delivery+service;
  add('Budget includes every fee',total<=input.task.budgetCents,`${total} / ${input.task.budgetCents} cents`);
  add('Delivery window',!!merchant&&merchant.eta<=input.task.maxDeliveryMinutes,`${merchant?.eta??'?'} / ${input.task.maxDeliveryMinutes} minutes (demo estimate)`);
  add('Nonempty basket',lines.length>0,`${lines.length} distinct items`);
  const digest=createHash('sha256').update(JSON.stringify({merchant:candidate.merchantId,items:lines.map(l=>({id:l.productId,quantity:l.quantity,price:l.unitPrice})),total,currency:'usd'})).digest('hex');
  return {valid:checks.every(c=>c.passed),checks,merchant,items:lines,subtotal,tax,delivery,service,total,currency:'usd',digest,reasoning:candidate.reasoning??''};
}
export function assertSpend(quote, approval, now=Date.now()) {
  if(!approval)throw new Error('Approve the basket before checkout.');
  if(approval.expiresAt<=now)throw new Error('Approval expired. Review the current basket again.');
  if(quote.digest!==approval.digest||quote.total!==approval.amount)throw new Error('The cart changed after approval. A new approval is required.');
  if(quote.total>approval.budget)throw new Error('The current basket exceeds the approved budget.');
  return true;
}
