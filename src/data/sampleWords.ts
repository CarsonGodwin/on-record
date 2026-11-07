/*
 * Word banks for the parts of the sample history in sample.ts that aren't
 * music from sampleCatalog.ts: the podcasts, their guests and the audiobook.
 * Those are invented, so the demo doesn't put made-up listening on a real show.
 */

/** Genres double as "scenes": artists played together in the same sessions */
export const ELECTRONIC = 0
export const FOLK = 1
export const POP = 2
export const HIPHOP = 3
export const INDIE = 4
export const GENRES = 5

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
