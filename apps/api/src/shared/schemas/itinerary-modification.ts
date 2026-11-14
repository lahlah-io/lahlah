export type ItineraryModification =
  | {
      operation: "replace_destination";
      targetPosition?: number;
      targetName?: string;
      targetLast?: boolean;
    }
  | {
      operation: "remove_destination";
      targetPosition?: number;
      targetName?: string;
      targetLast?: boolean;
    }
  | { operation: "add_destination"; quantity: number }
  | { operation: "clarify_modification"; targetPosition?: number }
  | { operation: "select_version"; version: number };
