import type { Story } from "@/src/domain/story";

export function formatStoryTimestamp(value: string): string {
  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

export function storyOptionLabel(story: Pick<Story, "title">): string {
  return story.title;
}
