// Recipes from the based.cooking project, released into the public domain
// under the Unlicense: https://github.com/lukesmithxyz/based.cooking
// Translated to ClaraScript; quantities and step order follow the source.

export interface Example {
	id: string;
	name: string;
	category: string;
	text: string;
}

export const EXAMPLES: Example[] = [
	{
		id: 'banana-bread',
		name: 'Banana Bread',
		category: 'bread',
		text: `title: Banana Bread
units: imperial

mix | wet ingredients
- eggs: 2
- mashed bananas: 1 1/2 cups | about 4-5 bananas
- butter: 1/2 cup
- sugar: 1 cup | brown or white
= wet

mix | dry ingredients
- flour: 2 cups | all purpose
- baking powder: 1 1/2 tsp
- baking soda: 1/2 tsp
- cinnamon: 1 tsp
- nutmeg: 1/4 tsp
- ginger: 1/4 tsp
- salt: 1/4 tsp
= dry

combine | slowly add wet to dry while mixing, until no dry bits of flour remain
@ dry
@ wet
- walnuts: 1/4 cup | crushed
pour | into a lightly buttered or oiled loaf pan
bake | around 1 hr | 350 F oven, preheat; ready when a skewer poked inside comes out clean`,
	},
	{
		id: 'beef-stew',
		name: 'Traditional Beef or Lamb Stew',
		category: 'stew',
		text: `title: Traditional Beef or Lamb Stew
units: imperial

chop | into bite-sized chunks, roughly the same size as the meat
- onion
- celery
- carrot
= vegetables

brown | on all sides, in batches to avoid overcrowding
- lamb shoulder or beef chuck
- oil
= meat

add | vegetables and whole garlic, with salt to draw out moisture and deglaze the caramelised bits
@ vegetables
- garlic
- salt
deglaze | with about a third of a bottle of stout or porter, until the alcohol evaporates | optional
@ meat
- stout or porter: a bottle | optional, for extra flavour
simmer | 2-2.5 hr | low heat
- beef or chicken stock
- thyme
- rosemary
- bay leaves
thicken | add cut potatoes for the last half hour, or whisk in a flour-and-water slurry
- potatoes | cut up, optional, added for the last half hour
- flour: 1 tsp | mixed with water, whisked in gradually, alternative thickener
> Serve with mashed potatoes.`,
	},
	{
		id: 'carbonara',
		name: 'Carbonara',
		category: 'pasta',
		text: `title: Carbonara
serves: 4
units: metric

crack | yolks only
- eggs: 5
x egg whites
- pecorino romano or parmigiano-reggiano: 35 g / grate
- black pepper | optional
beat | until liquid | with a fork
= egg mix

fry | low to medium heat | until the sides are crisp but the inside stays chewy
- guanciale or smoked pancetta: 150 g / clean and cube
- olive oil: a dash | if not using an iron or nonstick pan
= guanciale

boil | 1 min less than the packet instructs
- spaghetti: 320 g
- water: salted lightly
drain
x cooking water
= pasta

toss | off heat, wait a minute if the pasta is too hot | keep stirring to incorporate
@ pasta
@ egg mix
@ guanciale
serve
- pecorino romano or parmigiano-reggiano | grated, to garnish, optional
- black pepper | to garnish, optional`,
	},
	{
		id: 'chicken-tikka-masala',
		name: 'Chicken Tikka Masala',
		category: 'curry',
		text: `title: Chicken Tikka Masala
serves: 8
units: imperial

mix | until smooth
- cornstarch: 1 Tbsp
- heavy whipping cream: 1 cup
= slurry

combine | in a 5-qt slow cooker, can blend first for convenience
- tomato puree: 29 oz | canned
- plain yogurt: 1 1/2 cups
- onion: 1/2 large / chop | finely
- olive oil: 2 Tbsp
- gingerroot: 4 1/2 tsp | fresh / mince
- garlic: 4 cloves / mince
- garam masala: 1 Tbsp
- salt: 2 1/2 tsp
- cumin: 1 1/2 tsp | ground
- paprika: 1 tsp
- pepper: 3/4 tsp
- cayenne pepper: 1/2 tsp
- cinnamon: 1/4 tsp | ground
cook | 4 hr | covered, low, or until chicken is tender
- chicken breasts: 2 1/2 lb | boneless, skinless / cube | 1 1/2 in
- jalapeno pepper: 1 / halve and seed
- bay leaf: 1
x jalapeno pepper and bay leaf
stir | gradually, into the sauce
@ slurry
cook | 15-20 min | covered, high, until sauce is thickened
serve | over rice, sprinkle with cilantro if desired
- basmati rice: hot, cooked
- cilantro: fresh | optional / chop`,
	},
	{
		id: 'chocolate-chip-cookies',
		name: 'Chocolate Chip Cookies',
		category: 'dessert',
		text: `title: Chocolate Chip Cookies
serves: 4
units: metric

> Preheat oven to 375 F

mix
- bread flour: 330 g
- baking soda: 5 g
- salt: 5 g
= dry

beat | a few min
- butter: 230 g (2 sticks) / melt
- white sugar: 100-200 g
- brown sugar: 100-200 g
- egg: 1
- vanilla: 5 g
- milk: 15 g
= wet

combine
@ dry
@ wet
stir in
- chocolate chips: 225 g | 50-70% dark or semi-sweet milk
scoop | into balls, spaced on a lined baking sheet
bake | 8-10 min | one sheet at a time, until they start to brown
cool | a few min
transfer | to a cooling rack`,
	},
	{
		id: 'french-onion-soup',
		name: 'French Onion Soup',
		category: 'soup',
		text: `title: French Onion Soup
serves: 5
units: imperial

brush | onion juice over each side
- baguette: 1 loaf / slice
toast | 400 F oven | until toasted
broil | until cheese melted | covered
- cheese: melty, preferably guereye or swiss
= toasted bread

sweat | about 2 hr | covered dutch oven, med-low heat, stirring occasionally with increasing frequency
- onions: 6-7 / cut | into quarter moons
- butter: 1 stick
- olive oil: 1/2 cup
- salt: to taste
strain
> onion juice is reserved and brushed onto the bread separately
deglaze | med-high heat, uncovered, stirring frequently
- chicken broth: 1 can
caramelize | add each ingredient slowly, waiting for a fond to form between additions
- garlic: 3 cloves / chop | finely
- brown sugar: 1/4 cup
- balsamic vinegar: to taste
- worcestershire sauce: to taste
- soy sauce: to taste
simmer | covered, medium heat, until simmering
- beef broth: 64 oz
- bay leaves: 2-3
serve | soup poured over bread, or bread floating on top
@ toasted bread`,
	},
	{
		id: 'gnocchi',
		name: 'Gnocchi',
		category: 'side',
		text: `title: Gnocchi

boil | with skins | until mashable
- potatoes
peel
x skins
mash
- kosher salt
knead
- flour
roll | into a long snake
slice | into small pieces
press | make an indentation
= dough

melt
- butter
- sage: sprigs | or oregano or thyme
- tomato / smash | optional, for the juices
= sauce

boil
- water
- kosher salt: lots
@ dough
drain
x most of the water
= pasta water
roast | 1-2 min | until slightly browned
@ sauce
loosen
@ pasta water
serve
- parmesan / grate | liberally
- garnish: optional`,
	},
	{
		id: 'guacamole',
		name: 'Fresh Guacamole',
		category: 'spread',
		text: `title: Fresh Guacamole
serves: 2

mash | mix in lime juice, mash again
- hass avocados: 2 / halve | pit and scoop
- lime: 1 / juice
combine
- cilantro / mince
- tomato: 1 small / mince
- onion: 1/4 medium / mince
season | mix thoroughly
- salt | to taste
- black pepper | to taste
> best consumed fresh, avocado oxidises quickly
serve
- totopos corn chips | for serving`,
	},
	{
		id: 'hummus',
		name: 'Hummus',
		category: 'spread',
		text: `title: Hummus
units: imperial

boil | 20 min | until the skins loosen and the beans look mushy, reduce heat as needed to stop it boiling over
- garbanzo beans (chickpeas): 1 can / drain and rinse
- baking soda: 1/2 teaspoon
- water: a few inches
drain
x cooking water
rinse | 30 sec | cold water, removes the baking soda taste
= beans

mix
- garlic: 1-2 cloves / chop | roughly, fresh or frozen pre-chopped, not dry
- lemon juice: 1/4 cup | or more to taste, about 1 1/2 to 2 lemons' worth
- salt: 1/4 teaspoon
pulse | until fine and uniform | scrape down the bowl as needed
rest | at least 10 min | mellows the raw garlic taste
= garlic lemon

add
@ garlic lemon
- tahini: 1/2 cup
blend | until creamy | scrape down the sides and bottom
drizzle | slowly, food processor running on high
- ice water: 2 Tbsp
whip | until pale and thickened | scrape down 1-3 times as needed
= tahini whip

combine
@ tahini whip
@ beans
- cumin: 1/4 teaspoon | ground, toast and grind first if using whole
- za'atar: 1/4 teaspoon | optional
pulse | a few times
drizzle | slowly, food processor running on high
- olive oil: 1 Tbsp
process | 1 to 3 min | until smooth
- ice water | to thin, a teaspoon at a time, optional
taste | adjust the lemon juice or salt to taste
> refrigerate in an airtight container for up to a week
serve
- olive oil | to top
- parsley | finely chopped, optional
- za'atar | optional, extra
- sumac | optional
- dukkah | optional`,
	},
	{
		id: 'miso-soup',
		name: 'Miso Soup',
		category: 'soup',
		text: `title: Miso Soup
units: metric

boil
- water: about half
add
- dashi stock
boil
- tofu: optional / cut into bite-sized pieces
- seaweed: optional / cut into bite-sized pieces
melt
- miso paste
boil
serve
- green onion: optional / slice`,
	},
	{
		id: 'no-knead-bread',
		name: 'No-knead Bread',
		category: 'bread',
		text: `title: No-knead Bread
units: imperial

mix
- flour: 3 cups
- salt: 1 tsp
- yeast: 1/4 tsp | instant, or 1.25/4 tsp active dry
add
- water: 1 1/2 cups | warm
rest | 12 h | room temp, or fridge up to 48 h
> Preheat oven and pan to 450 F
bake | 30 min | covered, e.g. foil
- oven-safe pan
bake | 20 min | uncovered`,
	},
	{
		id: 'pancake',
		name: 'Pancake',
		category: 'breakfast',
		text: `title: Pancake
serves: 1
units: metric

heat
- butter: a bit
= pan

mix
- wheat flour: 200 g
- milk: 200 ml
- eggs: 2
- sugar: 2 tsp
- baking soda: 1 tsp
- salt: a little bit
rest | ~15 min
bake | a ladle at a time | lower medium heat | until brown on both sides
@ pan
> Serve with syrup, or cinnamon and sugar`,
	},
	{
		id: 'ratatouille',
		name: 'Ratatouille',
		category: 'soup',
		text: `title: Ratatouille
serves: 12
units: imperial

boil | 2 min
- tomatoes: 3 1/2 lbs / core
drain
peel
x skins
= tomatoes

saute | 20 min | covered, stirring frequently
- olive oil: as necessary
- onions: 2 lbs / chop
- garlic: 6 cloves / chop
- bell peppers: 3 / clean | cut into strips
= base

simmer | 15 min | stir well
@ base
- herbes de provence (basil, thyme, parsley)
- tomato paste: 140 g | optional if tomatoes lack flavour
@ tomatoes
add
- eggplant: 1 1/2 lbs / cut | into disks
- zucchini: 1 lb / cut | into disks
cook | 30 min
- salt
- pepper`,
	},
	{
		id: 'shakshouka',
		name: 'Shakshouka',
		category: 'breakfast',
		text: `title: Shakshouka
serves: 2

scald
- tomatoes: 5 small
peel | cut into cubes
x tomato skins
= tomatoes

glaze | in a frying pan
- onion: 1 | white, peeled / chop
- oil
add
@ tomatoes
season
- cumin
- powdered sweet pepper
simmer | until it gets denser | stir occasionally
crack
- eggs: 5
season | to taste
cover | with a lid
cook | until the eggs are set
garnish
- chives: some`,
	},
	{
		id: 'shepherds-pie',
		name: "Shepherd's Pie",
		category: 'pie',
		text: `title: Shepherd's Pie
serves: 8
units: metric

boil | 20 min | in saltwater
- potatoes: 600 g | mealy, floury / peel and dice
drain
mash
- butter: 30 g
- milk: 200 ml
- nutmeg: 1 pinch
= mash

fry | until crumbly
- oil: 4 tbsp
- lamb: 800 g | minced
add
- onions: 2 / peel and dice
- carrots: 2 / peel and dice
- peas: 100 g | frozen
add
- tomato paste/puree: 2 tbsp
- beef stock: 300 ml
season
- paprika: 1 tbsp | sweet or smoked
- pepper
- salt
= filling

preheat | 200 C
grease
- butter
assemble
@ filling
@ mash | piped on top
bake | 30-40 min`,
	},
	{
		id: 'tzatziki',
		name: 'Tzatziki',
		category: 'spread',
		text: `title: Tzatziki
serves: 3
units: imperial

grate | finely
- cucumber: 3 in
strain | with a clean kitchen towel
x liquid
= cucumber

mash
- garlic: 1 clove
- olive oil: 1 tsp
= garlic oil

mix
- Greek yogurt: 2 cups
- dill / chop | finely
@ cucumber
@ garlic oil
season
- lemon: some | squeezed in, or lime, or vinegar
- salt: a generous pinch
- pepper: a small pinch
finish
- olive oil: extra | optional
stir | enjoy with your favourite snack`,
	},
];
