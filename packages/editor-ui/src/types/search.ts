export type SearchToken =
  | { type: "text"; value: string }
  | { field: string; type: "field"; value: string }
  | { field: string; type: "flag"; value?: string }
  | {
      field: string
      op: "after" | "before" | "on"
      type: "date"
      value: string
    }

export type SearchSuggestion = {
  id: string
  label: string
  token: SearchToken
  description?: string
}

export type SearchLabels = {
  close?: string
  clear: string
  filters: string
  input: string
  remove: string
  search: string
}
