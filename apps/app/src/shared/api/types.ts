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
