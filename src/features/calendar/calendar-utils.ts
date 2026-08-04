import { parseLocalDate } from "@/lib/utils";
import type { CalendarItem, EventType } from "./calendar-types";

export const mapItemToEvent = (item: CalendarItem): EventType => {
  const { type: transactionType, ...restOfData } = item.data;

  let startDate: Date;

  if (
    item.item_type === "task" ||
    item.item_type === "transaction" ||
    item.item_type === "transaction_summary"
  ) {
    startDate = parseLocalDate(item.start_time);
  } else {
    startDate = new Date(item.start_time);
  }

  return {
    id: item.item_id,
    title: item.title,
    start: startDate,
    end: item.end_time ? new Date(item.end_time) : undefined,
    allDay:
      item.item_type === "task" ||
      item.item_type === "transaction" ||
      item.item_type === "habit_summary" ||
      item.item_type === "transaction_summary" ||
      Boolean(item.data.is_all_day),
    type: item.item_type,
    transactionType: transactionType as string | undefined,
    ...restOfData,
  };
};

export const getEventsForDate = (events: EventType[], date: Date) => {
  return events.filter((event) => {
    const eventDate = new Date(event.start);
    return eventDate.toDateString() === date.toDateString();
  });
};
