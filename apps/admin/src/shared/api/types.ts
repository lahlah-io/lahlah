/** Bentuk envelope respons API Lahlah di `apps/api`. */

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export type DataEnvelope<T> = {
  data: T;
};

export type PageMeta = {
  page: number;
  limit: number;
  total: number;
};

export type ListEnvelope<T> = {
  data: T[];
  meta: PageMeta;
};
