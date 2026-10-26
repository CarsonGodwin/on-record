/*
 * Word banks for the sample history in sample.ts. Everything built from them
 * is invented: names are assembled from parts so the demo reads like a real
 * library without putting made-up listening habits on a real musician.
 * Carols are the exception, and they're centuries old.
 */

/** Genres double as "scenes": artists played together in the same sessions */
export const ELECTRONIC = 0
export const FOLK = 1
export const POP = 2
export const HIPHOP = 3
export const INDIE = 4
export const GENRES = 5

/** The artists the history is built around, most played first */
export const CORE_ARTISTS: [name: string, genre: number][] = [
  ['Velvet Harbor', INDIE],
  ['Juniper Vale', FOLK],
  ['Honey Arcade', POP],
  ['Midnight Atlas', ELECTRONIC],
  ['Sable Monroe', HIPHOP],
  ['The Paper Moons', INDIE],
  ['Cassia Reyes', FOLK],
  ['Lumen Kid', ELECTRONIC],
  ['Rook Avenue', HIPHOP],
  ['Golden Hour Club', POP],
  ['Static Bloom', INDIE],
  ['Odessa Lane', FOLK],
  ['Glasshouse Park', ELECTRONIC],
  ['Kid Sonnet', HIPHOP],
  ['Polaroid Summer', POP],
  ['Low Tide Social', INDIE],
  ['Marlowe Fox', FOLK],
  ['Tidal Youth', ELECTRONIC],
  ['Mira Castell', HIPHOP],
  ['Ivy & The Echoes', POP],
  ['Pale Satellite', INDIE],
  ['Wild Fern', FOLK],
  ['Ghost Orchard', ELECTRONIC],
  ['Dez Harlow', HIPHOP],
  ['Lavender Static', POP],
  ['Saltwater Choir', INDIE],
  ['Brass Lanterns', FOLK],
  ['Desert Radio', ELECTRONIC],
  ['Copper Kites', INDIE],
  ['Neon Orchard', POP],
]

/** Bands that were around long before this history starts, so their albums come remastered */
export const CLASSIC_ARTISTS = new Set(['Saltwater Choir', 'Brass Lanterns'])

/** Artists with a Christmas album in their catalog */
export const HOLIDAY_ARTISTS = new Set(['Juniper Vale', 'Honey Arcade'])

export const FIRST_NAMES = [
  'Ada', 'Anouk', 'Bastian', 'Bram', 'Celeste', 'Cleo', 'Darius', 'Dax', 'Elodie', 'Esme',
  'Ezra', 'Femi', 'Flora', 'Gideon', 'Greer', 'Hana', 'Hollis', 'Idris', 'Inez', 'Isla',
  'Jude', 'Kenji', 'Kit', 'Kofi', 'Lev', 'Lior', 'Maren', 'Marisol', 'Mateo', 'Nell',
  'Nico', 'Noor', 'Oona', 'Otis', 'Ottilie', 'Pia', 'Priya', 'Quinn', 'Rafe', 'Remy',
  'Rocco', 'Rosalind', 'Sage', 'Soren', 'Sunny', 'Talia', 'Tamsin', 'Theo', 'Tobin', 'Uma',
  'Vesper', 'Vida', 'Wilder', 'Willa', 'Wren', 'Yara', 'Zeke',
]

export const LAST_NAMES = [
  'Abernathy', 'Ashby', 'Blackwood', 'Calder', 'Castellanos', 'Delacroix', 'Dunmore', 'Easton',
  'Ellery', 'Fairweather', 'Finch', 'Galloway', 'Greaves', 'Hartigan', 'Holloway', 'Ives',
  'Iwata', 'Jessop', 'Kaur', 'Kestrel', 'Larkin', 'Lindqvist', 'Mercado', 'Moreau', 'Nakamura',
  'Navarre', 'Okafor', 'Pell', 'Penhallow', 'Quill', 'Rhys', 'Rourke', 'Salazar', 'Sorensen',
  'Thorne', 'Tierney', 'Underhill', 'Valdez', 'Vance', 'Whitlock', 'Winslow', 'Yarrow',
]

export const BAND_ADJECTIVES = [
  'Cardboard', 'Electric', 'Glass', 'Golden', 'Hollow', 'Lucky', 'Lunar', 'Midnight', 'Neon',
  'Pale', 'Paper', 'Plastic', 'Quiet', 'Silver', 'Sleepy', 'Soft', 'Static', 'Sunday', 'Tender', 'Velvet',
]

export const BAND_NOUNS = [
  'Arcades', 'Comets', 'Cousins', 'Engines', 'Gardens', 'Ghosts', 'Harbors', 'Kites', 'Lanterns',
  'Lungs', 'Machines', 'Orchards', 'Pilots', 'Radios', 'Rivals', 'Saints', 'Satellites', 'Shapes',
  'Swimmers', 'Tigers',
]

export const PLANTS = ['Bramble', 'Clover', 'Hazel', 'Sorrel', 'Thistle', 'Willow', 'Yarrow', 'Aster']

/** Halves of one-word electronic names, written in lowercase */
export const SYLLABLES = ['sol', 'lumi', 'nova', 'kai', 'vel', 'orbi', 'aero', 'halo', 'mira', 'tessel', 'cirro', 'ely', 'umbra', 'fen']
export const ENDINGS = ['ra', 'x', 'sis', 'tone', 'form', 'scape', 'lune', 'ka', 'dyne', 'vane', 'drift']
export const ELECTRO_ADJECTIVES = ['Night', 'Soft', 'Low', 'Slow', 'Deep', 'Late', 'Blue', 'Ghost', 'Cold', 'Glass']
export const ELECTRO_NOUNS = ['Mode', 'Reset', 'Orbit', 'Signal', 'Circuit', 'Relay', 'Drift', 'Pulse', 'Frequency', 'Archive']

export const POP_ADJECTIVES = ['Cherry', 'Sugar', 'Candy', 'Glitter', 'Satin', 'Diamond', 'Pink', 'Velvet']
export const POP_NOUNS = ['Club', 'Riot', 'Hearts', 'Season', 'Parade', 'Machine', 'Girls', 'Disco']

export const RAP_WORDS = ['Sonnet', 'Atlas', 'Velour', 'Cobalt', 'Saturn', 'Marrow', 'Comet', 'Ledger', 'Halo', 'Monday']

export const NOUNS = [
  'Afterglow', 'Arcade', 'Cherry', 'Copper', 'Daydream', 'Daylight', 'Dust', 'Echo', 'Fever',
  'Fireworks', 'Gasoline', 'Glass', 'Gold', 'Headlights', 'Heartbeat', 'Highway', 'Honey',
  'Lantern', 'Lightning', 'Marigold', 'Midnight', 'Moonlight', 'Neon', 'Ocean', 'Orbit', 'Paper',
  'Polaroid', 'Porchlight', 'River', 'Rooftops', 'Saltwater', 'Satellite', 'Shadows', 'Signals',
  'Silver', 'Static', 'Summer', 'Sunburn', 'Telephone', 'Thunder', 'Tides', 'Undertow', 'Velvet',
  'Wallpaper', 'Weather', 'Wildfire', 'Wires',
]

export const PLURALS = [
  'Afternoons', 'Bruises', 'Daisies', 'Diamonds', 'Echoes', 'Fireworks', 'Ghosts', 'Headlights',
  'Kites', 'Lanterns', 'Paper Planes', 'Polaroids', 'Postcards', 'Roses', 'Rooftops', 'Satellites',
  'Seasons', 'Shadows', 'Signals', 'Sparklers', 'Strangers', 'Taillights', 'Tides', 'Wolves',
]

export const ADJECTIVES = [
  'Brave', 'Careless', 'Easy', 'Electric', 'Faded', 'Gentle', 'Golden', 'Heavy', 'Honest',
  'Invisible', 'Lonely', 'Lost', 'Lucky', 'Quiet', 'Reckless', 'Restless', 'Sleepless', 'Slow',
  'Soft', 'Strange', 'Sweet', 'Tender', 'Wild', 'Young',
]

export const VERBS = [
  'Wait', 'Stay', 'Leave', 'Dance', 'Sleep', 'Run', 'Pretend', 'Forget', 'Look Back', 'Hold On',
  'Let Go', 'Fall Apart', 'Come Home', 'Call', 'Breathe', 'Change', 'Slow Down', 'Grow Up', 'Give In', 'Say It',
]

export const PLACES = [
  'Austin', 'Brooklyn', 'Denver', 'Dublin', 'Glasgow', 'Havana', 'Kyoto', 'Lisbon', 'Marseille',
  'Memphis', 'Montreal', 'Ohio', 'Oslo', 'Palermo', 'Reno', 'Seoul', 'Tokyo', 'Tucson',
]

export const VENUES = ['the Lantern Room', 'Harbor Hall', 'the Glasshouse', 'Union Pavilion', 'the Copper Mill']

/** Public domain, so any of the fictional artists can cover them */
export const CAROLS = [
  'Silent Night', 'Deck the Halls', 'O Holy Night', 'Jingle Bells', 'We Wish You a Merry Christmas',
  'Hark! The Herald Angels Sing', 'The First Noel', 'Joy to the World', 'Good King Wenceslas',
  'O Come, All Ye Faithful', 'God Rest Ye Merry Gentlemen', 'Up on the Housetop',
]

/** Song title shapes, weighted toward the short ones real titles mostly are */
export const TITLE_SHAPES: [weight: number, make: (w: Words) => string][] = [
  [6, (w) => w.pick(NOUNS)],
  [5, (w) => `${w.pick(ADJECTIVES)} ${w.pick(NOUNS)}`],
  [2, (w) => w.pick(PLURALS)],
  [2, (w) => `${w.pick(ADJECTIVES)} ${w.pick(PLURALS)}`],
  [2, (w) => w.pick(VERBS)],
  [2, (w) => w.pick(FIRST_NAMES)],
  [1, (w) => `${w.pick(NOUNS)} in the ${w.pick(['Dark', 'Rain', 'Rearview', 'Kitchen', 'Morning', 'Water', 'Backseat', 'Garden'])}`],
  [1, (w) => `Call Me When You're ${w.pick(['Home', 'Lonely', 'Ready', 'Gone', 'Older', 'Sober'])}`],
  [1, (w) => `I Don't ${w.pick(VERBS)} Anymore`],
  [1, (w) => `Don't ${w.pick(VERBS)}`],
  [1, (w) => `If You ${w.pick(VERBS)}`],
  [1, (w) => `Last Night in ${w.pick(PLACES)}`],
  [1, (w) => `Back to ${w.pick(PLACES)}`],
  [1, (w) => `${w.pick(['Sunday', 'Monday', 'Friday', 'Saturday'])} ${w.pick(['Morning', 'Night', 'Again', 'Forever'])}`],
  [1, (w) => `All My ${w.pick(PLURALS)}`],
  [1, (w) => `${w.pick(NOUNS)} Song`],
  [1, (w) => `Nothing Feels Like ${w.pick(['Home', 'You', 'This', 'Summer', 'Saturday', 'the First Time'])}`],
  [1, (w) => `Better Than ${w.pick(['This', 'Before', 'Nothing', 'Yesterday', 'Ever'])}`],
  [1, (w) => `${w.pick(ADJECTIVES)} Again`],
  [1, (w) => `Where the ${w.pick(PLURALS)} Go`],
  [1, (w) => `Everything Is ${w.pick(ADJECTIVES)}`],
  [1, (w) => `Somebody ${w.pick(['Else', 'New', 'Like You', 'Better'])}`],
  [1, (w) => w.pick(['2 AM', '4 AM', 'Seventeen', 'Twenty-One', 'Half Past Two', 'Midnight Train'])],
  [1, (w) => w.pickSome(NOUNS, 2).join(' & ')],
]

/** Folk leans on place names and people */
export const FOLK_SHAPES: ((w: Words) => string)[] = [
  (w) => `Ballad of ${w.pick(FIRST_NAMES)}`,
  (w) => `Song for ${w.pick(FIRST_NAMES)}`,
  (w) => `${w.pick(PLACES)}`,
  (w) => `The ${w.pick(['Long', 'Old', 'Low', 'Cold'])} ${w.pick(['Road', 'River', 'Winter', 'Field', 'Harbour'])}`,
]

export const ALBUM_SHAPES: ((w: Words) => string)[] = [
  (w) => `${w.pick(ADJECTIVES)} ${w.pick(NOUNS)}`,
  (w) => w.pick(NOUNS),
  (w) => `${w.pick(NOUNS)} Season`,
  (w) => `Songs for ${w.pick(PLURALS)}`,
  (w) => `The ${w.pick(ADJECTIVES)} ${w.pick(PLURALS)}`,
  (w) => `${w.pick(NOUNS)} ${w.pick(['Sessions', 'Tapes', 'Years', 'Hours'])}`,
  (w) => `Everything ${w.pick(['at Once', 'Is Fine', 'Goes', 'After'])}`,
]

/** Topics for the daily news show's episode titles */
export const NEWS = [
  'Rents', 'Robots', 'Rail Strikes', 'Bird Flu', 'Heat Waves', 'Interest Rates', 'Tariffs',
  'A Very Late Train', 'Self-Driving Taxis', 'School Lunches', 'Space Junk', 'The Housing Market',
  'Wildfire Season', 'Ticket Prices', 'Ocean Heat', 'Electric Buses', 'Budget Talks',
  'A Missing Painting', 'Cheap Flights', 'Pothole Season',
]

export const SCIENCE_SUBJECTS = ['Cats', 'Onions', 'Owls', 'Bees', 'Babies', 'Clouds', 'Knuckles', 'Octopuses', 'Mosquitoes', 'Ravens']
export const SCIENCE_VERBS = ['Purr', 'Glow', 'Float', 'Crack', 'Make Us Cry', 'Sleep So Much', 'Hum', 'Remember Faces', 'Dream', 'Hate Us']

export const INTERVIEW_TOPICS = [
  'Sleep', 'Cities', 'Boredom', 'Handwriting', 'Maps', 'Fungi', 'Silence', 'Trains', 'Failure',
  'Luck', 'Bread', 'Memory', 'Attention', 'Walking', 'Weather', 'Libraries',
]

export const SERIAL_CHAPTERS = [
  'The Last Crossing', 'A Ticket for Two', 'The Purser', 'Fog', 'What the Cook Saw',
  'The Second Passenger', 'Low Tide', 'The Letter',
]

/** The few random helpers the word banks need, so they work with any seeded generator */
export interface Words {
  pick: <T>(items: readonly T[]) => T
  /** `count` different items */
  pickSome: <T>(items: readonly T[], count: number) => T[]
  chance: (p: number) => boolean
}
