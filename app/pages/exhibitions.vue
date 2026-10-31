<script lang="ts" setup>
definePageMeta({ layout: "artist" });

useSeoMeta({
  title: "Exhibitions & Projects",
  description:
    "Solo and group exhibitions, projects, and artistic initiatives by Zimbabwean mixed media artist Jamie Stambolie Nelson, including Making Means.",
  ogTitle: "Exhibitions & Projects",
  ogDescription:
    "Solo and group exhibitions, projects, and artistic initiatives by Zimbabwean mixed media artist Jamie Stambolie Nelson.",
});

interface EntryDate {
  day: number;
  month: number;
  year: number;
}

interface Entry {
  upcoming?: boolean;
  title: string;
  url?: string;
  details: string;
  startDate?: EntryDate;
  endDate?: EntryDate;
  description?: string;
}

interface EntryGroup {
  heading?: string;
  entries: Entry[];
}

interface YearListing {
  year: number;
  sections: EntryGroup[];
}

const years: YearListing[] = [
  {
    year: 2026,
    sections: [
      {
        heading: "Solo exhibitions:",
        entries: [
          {
            upcoming: true,
            title: "Always Connected",
            details: "National Gallery of Zimbabwe in Bulwayo",
            startDate: { day: 15, month: 12, year: 2026 },
            endDate: { day: 23, month: 12, year: 2026 },
          },
          {
            upcoming: true,
            title: "Making Means",
            details: "Making Means website",
            startDate: { day: 1, month: 10, year: 2026 },
          },
        ],
      },
      {
        heading: "Group exhibitions:",
        entries: [
          {
            title: "Tambien somos la Liga",
            details: "Liga de Arte de San Juan, Puerto Rico",
            startDate: { day: 17, month: 9, year: 2026 },
            endDate: { day: 16, month: 10, year: 2026 },
          },
          {
            title: "9no aniversario de El Bastion",
            details: "El Bastion, San Juan, Puerto Rico",
            startDate: { day: 5, month: 9, year: 2026 },
            endDate: { day: 16, month: 10, year: 2026 },
          },
        ],
      },
    ],
  },
];

const projects: Entry[] = [
  {
    title: "Making Means",
    details: "Founder & Project Coordinator.",
    description:
      "Making Means is an initiative founded by Zimbabwean mixed-media artist Jamie Stambolie Nelson that connects Zimbabwean artists living abroad with locally led creative organisations in Zimbabwe through art, conversation, exchange, and collaboration",
  },
];

const pageSections = computed(() => [
  ...years.map((listing) => ({
    id: `year-${listing.year}`,
    heading: `${listing.year}:`,
    isYear: true,
    groups: listing.sections,
  })),
  {
    id: "projects",
    heading: "Projects & Artistic Initiatives:",
    isYear: false,
    groups: [{ entries: projects }] as EntryGroup[],
  },
]);

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ordinalSuffix(day: number) {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][day % 10] ?? "th";
}

function isoDate({ day, month, year }: EntryDate) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateParts(entry: Entry) {
  const { startDate, endDate } = entry;
  if (!startDate) return [];
  const dates = endDate ? [startDate, endDate] : [startDate];
  return dates.map((date, index) => {
    const rangeEnd = index === 0 ? endDate : undefined;
    const showYear = !rangeEnd || date.year !== rangeEnd.year;
    const showMonth = showYear || date.month !== rangeEnd?.month;
    return {
      datetime: isoDate(date),
      day: date.day,
      suffix: ordinalSuffix(date.day),
      rest: [showMonth && monthNames[date.month - 1], showYear && date.year]
        .filter(Boolean)
        .join(" "),
    };
  });
}
</script>

<template>
  <section class="artistExhibitions" aria-labelledby="exhibitions-heading">
    <h1 id="exhibitions-heading">Exhibitions &amp; Projects</h1>
    <div class="listings">
      <section
        v-for="section in pageSections"
        :key="section.id"
        class="listingSection"
        :aria-labelledby="`${section.id}-heading`"
      >
        <h2
          :id="`${section.id}-heading`"
          :class="section.isYear ? 'yearHeading' : 'projectsHeading'"
        >
          {{ section.heading }}
        </h2>
        <div v-for="(group, groupIndex) in section.groups" :key="groupIndex" class="entryGroup">
          <h3 v-if="group.heading">{{ group.heading }}</h3>
          <ul class="entryList">
            <li v-for="entry in group.entries" :key="entry.title">
              <p>
                <strong v-if="entry.upcoming">UPCOMING</strong> <a
                  v-if="entry.url"
                  class="entryTitle"
                  :href="entry.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >“{{ entry.title }}”<span class="visuallyHidden"> (opens in a new tab)</span></a>
                <cite v-else class="entryTitle">“{{ entry.title }}”</cite>,
                {{ entry.details }}<template v-if="entry.startDate">,
                  <template v-for="(part, partIndex) in dateParts(entry)" :key="part.datetime">
                    <template v-if="partIndex"> - </template>
                    <time :datetime="part.datetime">{{ part.day }}<sup>{{ part.suffix }}</sup>{{ part.rest ? ` ${part.rest}` : "" }}</time>
                  </template>
                </template>
              </p>
              <p v-if="entry.description" class="entryDescription">({{ entry.description }}).</p>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.artistExhibitions {
  width: min(100% - 2rem, 120rem);
  margin: 0 auto;
  padding: 2.5rem 0 5rem;
}

.artistExhibitions h1 {
  margin: 0 0 2rem;
  color: var(--artist-gold);
  font-size: clamp(3rem, 3.8vw, 5rem);
  line-height: 1.1;
  font-weight: 700;
  text-align: center;
}

.listings {
  display: grid;
  gap: 2.5rem;
  font-size: clamp(1.125rem, 1.65vw, 2.125rem);
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.listingSection h2,
.entryGroup h3 {
  margin: 0;
  font-weight: 700;
  line-height: 1.2;
  text-decoration: underline;
  text-decoration-thickness: 0.06em;
  text-underline-offset: 0.12em;
}

.yearHeading {
  font-size: clamp(1.75rem, 2.35vw, 3.25rem);
}

.listingSection .projectsHeading {
  margin-bottom: 1rem;
  color: var(--artist-gold);
  font-size: clamp(1.75rem, 2.35vw, 3.25rem);
}

.entryGroup {
  margin-top: 1rem;
}

.entryGroup + .entryGroup {
  margin-top: 2rem;
}

.entryGroup h3 {
  margin-bottom: 1rem;
  color: var(--artist-gold);
  font-size: clamp(1.25rem, 1.75vw, 2.25rem);
}

.entryList {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 1rem;
}

.entryList p {
  margin: 0;
}

.entryTitle {
  color: inherit;
  font-style: normal;
  text-decoration: underline;
  text-decoration-thickness: 0.06em;
  text-underline-offset: 0.12em;
}

a.entryTitle:hover {
  text-decoration-thickness: 0.12em;
}

a.entryTitle:focus-visible {
  outline: 2px solid var(--artist-gold);
  outline-offset: 5px;
}

.entryList sup {
  font-size: 0.6em;
  line-height: 0;
}

.entryDescription {
  line-height: 1;
}

.visuallyHidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (min-width: 768px) {
  .artistExhibitions {
    width: min(76%, 120rem);
    padding: 2.8vw 0 3.5vw;
  }

  .artistExhibitions h1 {
    margin-bottom: 2vw;
  }

  .listings {
    gap: 2.5vw;
  }

  .entryGroup {
    margin-top: 0.8vw;
  }

  .entryGroup + .entryGroup {
    margin-top: 2vw;
  }

  .entryGroup h3 {
    margin-bottom: 1.2vw;
  }

  .entryList {
    gap: 1.2vw;
  }
}
</style>
