"use client";

import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";

// Initialize dayjs plugins once
if (typeof window !== "undefined") {
  dayjs.extend(localizedFormat);
}

export const DATE_FORMAT_OPTIONS = [
  { value: "YYYY-MM-DD HH:mm:ss", label: "YYYY-MM-DD HH:mm:ss" },
  { value: "YYYY/MM/DD HH:mm:ss", label: "YYYY/MM/DD HH:mm:ss" },
  { value: "MM/DD/YYYY HH:mm:ss", label: "MM/DD/YYYY HH:mm:ss" },
  { value: "HH:mm:ss MM/DD/YYYY", label: "HH:mm:ss MM/DD/YYYY" },
  { value: "HH:mm:ss", label: "HH:mm:ss" },
];

export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD HH:mm:ss";

export interface DateTimeFormatContextValue {
  dateTimeFormat: string;
  use24Hour: boolean;
  formatDate: (date: string | number | Date | null | undefined) => string;
}

const DateTimeFormatContext = createContext<DateTimeFormatContextValue>({
  dateTimeFormat: DEFAULT_DATE_FORMAT,
  use24Hour: true,
  formatDate: () => "",
});

export function DateTimeFormatProvider({
  dateTimeFormat,
  use24Hour,
  children,
}: {
  dateTimeFormat: string;
  use24Hour: boolean;
  children: ReactNode;
}) {
  const formatDate = (date: string | number | Date | null | undefined) => {
    if (date == null) return "—";
    const d = dayjs(date);
    if (!d.isValid()) return "—";
    let fmt = dateTimeFormat || DEFAULT_DATE_FORMAT;
    // If 12-hour mode is selected, convert HH to hh and add A
    if (!use24Hour) {
      fmt = fmt.replace("HH", "hh").replace("H", "h") + " A";
      // Avoid duplicate A if the original already has it (unlikely for our presets)
      fmt = fmt.replace(/ A A$/, " A");
    }
    return d.format(fmt);
  };

  const value = useMemo(
    () => ({
      dateTimeFormat,
      use24Hour,
      formatDate,
    }),
    [dateTimeFormat, use24Hour, formatDate],
  );

  return (
    <DateTimeFormatContext.Provider value={value}>
      {children}
    </DateTimeFormatContext.Provider>
  );
}

export function useDateTimeFormat() {
  return useContext(DateTimeFormatContext);
}

export function useFormatDate() {
  return useContext(DateTimeFormatContext).formatDate;
}
