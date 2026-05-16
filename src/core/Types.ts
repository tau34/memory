type Record = {
  content: string;
  date: string[];
}

type RecordData = {
  category: string;
  content: Record[];
};

type ErrorDisplay = {
  message: string;
  createdAt: Date;
}

export type { RecordData, Record, ErrorDisplay };
