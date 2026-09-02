"use server";

import { revalidatePath } from "next/cache";

import { workbenchService } from "@/src/workbench/runtime";

function requiredValue(formData: FormData, field: string): string {
  const value = formData.get(field);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing ${field}.`);
  }
  return value;
}

export async function selectPublication(formData: FormData): Promise<void> {
  await workbenchService.selectPublication(requiredValue(formData, "publicationId"));
  revalidatePath("/");
}

export async function addStory(formData: FormData): Promise<void> {
  await workbenchService.addStory(requiredValue(formData, "storyId"));
  revalidatePath("/");
}

export async function removeStory(formData: FormData): Promise<void> {
  await workbenchService.removeStory(requiredValue(formData, "storyId"));
  revalidatePath("/");
}

export async function moveStoryUp(formData: FormData): Promise<void> {
  await workbenchService.moveStoryUp(requiredValue(formData, "storyId"));
  revalidatePath("/");
}

export async function moveStoryDown(formData: FormData): Promise<void> {
  await workbenchService.moveStoryDown(requiredValue(formData, "storyId"));
  revalidatePath("/");
}

export async function publishSelectedStories(): Promise<void> {
  await workbenchService.publishSelectedStories();
  revalidatePath("/");
}
