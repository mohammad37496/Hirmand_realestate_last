export const DUPLICATE_PUBLIC_VISIT_FEEDBACK_MESSAGE = "بازخورد این بازدید قبلاً ثبت شده است.";

export function isDuplicatePublicVisitFeedbackConflict(status: number, message: string): boolean {
  return status === 409 && message === DUPLICATE_PUBLIC_VISIT_FEEDBACK_MESSAGE;
}
