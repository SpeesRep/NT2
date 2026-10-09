/** Sheet: dubbel = word (both directions), enkel = oneway (nl → answer), zin = sentence, vraag = question. */
export type CardType = 'word' | 'oneway' | 'sentence' | 'question';

export type Card = {
  id: string;
  type: CardType;
  nl: string;
  article: '' | 'de' | 'het';
  pos: string;
  example_nl: string;
  /** The help texts in ALL of the group's languages (kept on the device, so switching language works offline). */
  translations?: Record<string, Translation>;
  /** The text in the student's chosen help language ('' when none or missing): set by withHelpLang (src/helpLang.ts). */
  help: string;
  help_example: string;
  tags: string[];
  flags: string[];
  answer: string; // back of an enkel (oneway) card; display text only, never checked
  added: string; // yyyy-mm-dd
  active: boolean;
  order?: number; // position in the sheet (tie-break for `added`)
};

export type Translation = { text: string; example: string };

/** A topic. labels = its name per help language (only the group's languages). */
export type Tag = { tag: string; label_nl: string; labels?: Record<string, string>; subject_nl?: string };

/** The student's group (from its content.json). The code is the only thing that identifies it on the device. */
export type GroupInfo = { code: string; display_name: string; languages: string[] };

export type Settings = {
  new_per_day: number; // read only through getNewPerDay() (src/today.ts)
  desired_retention: number;
  unlock_prod_stability_days: number;
  known_stability_days: number; // a card is "bekend" from this stability (curriculum rule bekend, Voortgang)
  known_min_reviews: number; // … and at least this many reviews
  show_french_help: boolean; // Sheet: show the Hulp panels (in the student's help language)
  max_learning_backlog: number;
  due_window_minutes: number; // cards due within this many minutes count as due now
  max_reviews_per_day: number; // silent cap on the due part of today's work; overflow rolls to tomorrow
  listen_share: number; // share of word-recognition reviews done as listening cards (0 = off)
};

/**
 * One row of the Curriculum tab. rule: 'always' | 'date' | 'known' | 'closed' (sheet: altijd | datum | bekend |
 * dicht); any other text is kept as is and fails validation. date = YYYY-MM-DD or ''.
 */
export type CurriculumRow = {
  order: number;
  tag: string;
  rule: string;
  date: string;
  percentage: number | null;
  from_tags: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  new_per_day: 10,
  desired_retention: 0.9,
  unlock_prod_stability_days: 3,
  known_stability_days: 7,
  known_min_reviews: 2,
  show_french_help: true,
  max_learning_backlog: 3,
  due_window_minutes: 5,
  max_reviews_per_day: 100,
  listen_share: 0.3
};

/** A group's content.json (scripts/build-content.mjs). An inactive group is {format, code, active:false}. */
export type ContentFile = {
  format: number;
  code: string;
  active: boolean;
  version?: string;
  display_name?: string;
  languages?: string[];
  cards?: Card[];
  settings?: Partial<Settings>;
  tags?: Tag[];
  curriculum?: CurriculumRow[];
};
