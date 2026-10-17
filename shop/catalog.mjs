export const MERCHANTS = [
  { id: 'flash', name: 'Flash Basket', subtitle: 'The quick-commerce pick', eta: 12, deliveryFee: 199, serviceFee: 75, accent: '#d8ee78', rating: 4.8 },
  { id: 'fresh', name: 'Fresh Lane', subtitle: 'A little fresher. A little slower.', eta: 18, deliveryFee: 99, serviceFee: 65, accent: '#bfe5cd', rating: 4.9 },
  { id: 'corner', name: 'Corner & Co.', subtitle: 'Your neighborhood essentials', eta: 24, deliveryFee: 49, serviceFee: 50, accent: '#f1ceb0', rating: 4.7 }
];
const rows = [
  ['popcorn','Sea salt popcorn','snack','🍿',349,4,[],['vegan'],'90 g','Butter-free, movie-ready'],
  ['chips','Kettle potato chips','snack','🥔',299,3,[],['vegan'],'150 g','A very good crunch'],
  ['nachos','Corn tortilla chips','snack','🌽',379,4,[],['vegan'],'200 g','Made for sharing'],
  ['trail','Roasted trail mix','snack','🥜',429,4,['peanut','tree_nut'],['vegan'],'180 g','Nuts, seeds & a little sweetness'],
  ['pretzels','Sea salt pretzels','snack','🥨',329,3,['wheat'],['vegan'],'180 g','Twisted to perfection'],
  ['salsa','Tomato salsa','dip','🍅',399,4,[],['vegan'],'250 g','Fresh, tangy, medium heat'],
  ['hummus','Classic hummus','dip','🫘',449,4,['sesame'],['vegan'],'200 g','Smooth chickpea goodness'],
  ['guac','Avocado guacamole','dip','🥑',549,4,[],['vegan'],'180 g','Ripe avocado, lime & a little salt'],
  ['soda','Sparkling citrus water','drink','🥤',499,4,[],['vegan'],'4 × 330 ml','A bright little refresh'],
  ['lemonade','Cloudy lemonade','drink','🍋',399,4,[],['vegan'],'1 L','Real lemons. Easy afternoons.'],
  ['juice','Fresh orange juice','drink','🍊',549,4,[],['vegan'],'1 L','Sunshine in a bottle'],
  ['chocolate','Dark chocolate bites','sweet','🍫',399,4,['soy'],['vegan'],'120 g','A sweet ending, 70% cacao'],
  ['cookies','Chocolate chip cookies','sweet','🍪',449,4,['milk','wheat'],[],'160 g','Soft centers, crisp edges'],
  ['icecream','Vanilla bean ice cream','sweet','🍨',599,4,['milk'],[],'500 ml','The classic, done right'],
  ['strawberries','Sweet strawberries','fruit','🍓',499,3,[],['vegan'],'250 g','Picked for the good days'],
  ['bananas','Organic bananas','fruit','🍌',229,4,[],['vegan'],'4 pieces','Perfectly snackable'],
  ['apples','Crisp red apples','fruit','🍎',349,4,[],['vegan'],'4 pieces','Fresh from the orchard'],
  ['avocados','Ready-to-eat avocados','produce','🥑',449,2,[],['vegan'],'2 pieces','The toast essential'],
  ['tomatoes','Cherry tomatoes','produce','🍅',299,3,[],['vegan'],'250 g','Small, sweet & sun-ripened'],
  ['greens','Baby salad greens','produce','🥬',349,3,[],['vegan'],'150 g','Wash, toss, enjoy'],
  ['bread','Sourdough loaf','bread','🍞',449,4,['wheat'],['vegan'],'400 g','Slow-fermented, naturally good'],
  ['bagels','Everything bagels','bread','🥯',499,4,['wheat','sesame'],['vegan'],'4 pieces','A better kind of morning'],
  ['eggs','Free-range eggs','protein','🥚',499,6,['egg'],['vegetarian'],'6 pieces','Breakfast starts here'],
  ['tofu','Organic firm tofu','protein','🧊',349,3,['soy'],['vegan'],'250 g','Your protein, your way'],
  ['yogurt','Greek yogurt','dairy','🥛',399,3,['milk'],['vegetarian'],'450 g','Thick, creamy & cultured'],
  ['oatmilk','Barista oat drink','dairy','🥛',429,4,[],['vegan'],'1 L','Made for that first coffee'],
  ['granola','Crunchy oat granola','breakfast','🥣',549,4,['tree_nut'],['vegan'],'350 g','Slow mornings, sorted'],
  ['oats','Rolled breakfast oats','breakfast','🌾',299,4,[],['vegan'],'500 g','A cupboard classic'],
  ['coffee','Cold brew coffee','coffee','☕',499,2,[],['vegan'],'500 ml','Smooth, bold, no waiting'],
  ['tea','Chamomile tea','coffee','🍵',349,10,[],['vegan'],'10 bags','A quieter kind of evening'],
  ['pasta','Rigatoni pasta','pantry','🍝',299,4,['wheat'],['vegan'],'500 g','Dinner, almost done'],
  ['sauce','Slow-cooked tomato sauce','sauce','🥫',399,4,[],['vegan'],'350 g','A little Italian comfort'],
  ['rice','Basmati rice','pantry','🍚',449,6,[],['vegan'],'1 kg','Fluffy, fragrant, dependable'],
  ['water','Still spring water','essential','💧',399,6,[],['vegan'],'6 × 500 ml','Hydration, handled'],
  ['tissue','Soft tissue box','household','🧻',249,1,[],[],'100 tissues','An everyday essential'],
  ['soap','Botanical hand soap','household','🧴',449,1,[],[],'250 ml','Clean hands, happy home']
];
export const PRODUCTS = rows.map(([id,name,category,emoji,basePrice,servings,allergens,tags,size,description], i) => ({ id,name,category,emoji,basePrice,servings,allergens,tags,size,description,color:['#f4eac9','#ece9d6','#edd9cf','#e5ecd9','#f2dfca','#f2e7dc'][i%6] }));
export const OFFERS = MERCHANTS.flatMap((m, mi) => PRODUCTS.map((p, i) => ({ merchantId:m.id,productId:p.id,price:p.basePrice + (mi===0?Math.round(p.basePrice*.07):mi===1?-Math.round(p.basePrice*.04):((i%3)-1)*25),stock:((i+mi*3)%13===0&&mi>0)?0:8+i%7 })));
export const CATEGORY_LABELS = { all:'All essentials',snack:'Snacks & bites',drink:'Drinks',sweet:'Sweet treats',fruit:'Fresh fruit',produce:'Veggies & greens',bread:'Bread & bakery',protein:'Protein',dairy:'Milk & yogurt',breakfast:'Breakfast',coffee:'Coffee & tea',pantry:'Pantry',dip:'Dips',sauce:'Sauces',essential:'Essentials',household:'Home care' };
export function catalog(overrides = {}) { return { merchants:structuredClone(MERCHANTS),products:structuredClone(PRODUCTS),offers:OFFERS.map(o=>({...o,...(overrides[`${o.merchantId}:${o.productId}`]||{})})) }; }
