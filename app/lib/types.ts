export type ViewKey = "view" | "mi" | "magazines" | "books" | "authors" | "publishers" | "approvals" | "users";
export type RowKind = "story" | "content";
export type CopyPlacement = "above" | "below";

export type RoleNameRow = {
    role: string;
    name: string;
    preserveSpacing?: boolean;
};

export type AutocompleteOption = {
    id?: string;
    internalKey?: string;
    name: string;
    reading?: string;
    aliases?: string[];
};

export type AuthorAliasEntry = {
    name: string;
    author_key?: string;
    author_id: string;
};

export type ListSelectionEntry = {
    name: string;
    id: string;
    internalKey?: string;
    reading?: string;
    role?: string;
};

export type SocialLinkEntry = {
    service: string;
    account: string;
    url: string;
    memo: string;
};

export type RelatedUrlEntry = {
    role: string;
    url: string;
    memo: string;
};

export type RelatedPublisherEntry = {
    role: string;
    name: string;
    publisher_key?: string;
    publisher_id: string;
};

export type RelatedMagazineEntry = {
    role: string;
    name: string;
    magazine_key?: string;
    magazine_id: string;
};

export type SelectableOption = string | {
    value: string;
    label: string;
};

export type StoryRow = {
    storyId?: string;
    position: number;
    title: string;
    titleReading: string;
    authors: string;
    storyType: string;
    pageCount: string;
    seriesTitle: string;
    seriesReading: string;
    subtitle: string;
    subtitleReading: string;
    episodeNumber: string;
    episodeLabel: string;
    colorInfo: string;
    memo: string;
    tags: string[];
};

export type ContentRow = {
    clientKey?: string;
    position: number;
    contentType: string;
    pageStart: string;
    pageEnd: string;
    detail: string;
    contributorsJson: string;
};

export type IssueStringKey = "magazineTitle" | "issueTitle" | "titleReading" | "subtitle" | "subtitleReading" | "publicationFrequency" | "mediaFormat" | "releaseYear" | "releaseMonth" | "releaseDay" | "publishersJson" | "displayReleaseYear" | "displayReleaseMonth" | "displayReleaseDay" | "displayReleaseCombinedMonth" | "displayReleaseCombinedDay" | "publicationYear" | "publicationMonth" | "publicationDay" | "publicationCombinedMonth" | "publicationCombinedDay" | "issueNumber" | "volumeNumber" | "totalIssueNumber" | "volumeNumberDisplayed" | "issueNumberCombined" | "volumeIssueNote" | "relatedMagazinesJson" | "publisherPerson" | "editorPerson" | "binding" | "magazineCode" | "category" | "rating" | "price" | "size" | "numberOfPages" | "note" | "tag" | "status";

export type IssueForm = Record<IssueStringKey, string> & {
    isSpecialIssue: boolean;
    isMitsumine: boolean;
};

export type ExistingIssue = {
    id: string;
    date: string;
    label: string;
    title: string;
    digest: string;
    status: string;
    createdAt?: string;
    updatedAt?: string;
    magazineId?: string;
    magazineTitle?: string;
    titleReading?: string;
    publicationFrequency?: string;
    mediaFormat?: string;
    year?: string;
    month?: string;
    day?: string;
    displayYear?: string;
    displayMonth?: string;
    displayDay?: string;
    displayCombinedMonth?: string;
    displayCombinedDay?: string;
    publicationYear?: string;
    publicationMonth?: string;
    publicationDay?: string;
    publicationCombinedMonth?: string;
    publicationCombinedDay?: string;
    subtitle?: string;
    subtitleReading?: string;
    volumeNumber?: string;
    issueNumber?: string;
    totalIssueNumber?: string;
    issueNumberDisplayed?: string;
    subIssueNumber?: string;
    volumeIssueNote?: string;
    publishersJson?: string;
    publisherPerson?: string;
    editorPerson?: string;
    relatedMagazinesJson?: string;
    binding?: string;
    magazineCode?: string;
    category?: string[];
    rating?: string;
    publisherName?: string;
    price?: string;
    size?: string;
    numberOfPages?: string;
    isSpecialIssue?: boolean;
    isMitsumine?: boolean;
    note?: string;
    tag?: string[];
    stories?: StoryRow[];
    contents?: ContentRow[];
};

export type MagazineHistoryItem = {
    id: string;
    title: string;
    publisher: string;
    lastEdited: string;
    note: string;
};

export type AuthorPublisherKind = "authors" | "publishers";
export type MasterEditorKind = AuthorPublisherKind | "magazines";

export type AuthorMasterRecord = {
    id: string;
    internalId?: string;
    name: string;
    reading: string;
    otherAuthorIds: string;
    socialLinks: string;
    memo: string;
    tag: string[];
    searchText: string;
    updatedAt?: string;
};

export type PublisherMasterRecord = {
    id: string;
    internalId?: string;
    name: string;
    reading: string;
    address: string;
    url: string;
    relatedLink: string;
    startDate: string;
    endDate: string;
    memo: string;
    relatedPublishers: string;
    tag: string[];
    searchText: string;
    updatedAt?: string;
};

export type MagazineMasterRecord = {
    id: string;
    internalId?: string;
    name: string;
    reading: string;
    aliasName: string;
    aliasReading: string;
    publishers: string;
    publicationFrequency: string[];
    firstPublishedDate: string;
    closedDate: string;
    issn: string;
    jpno: string;
    relatedMagazines: string;
    relationNote: string;
    memo: string;
    tag: string[];
    searchText: string;
    updatedAt?: string;
};
