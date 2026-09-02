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

export async function publishSelectedStories(formData: FormData): Promise<void> {
  const mode = formData.get("mode") === "real" ? "real" : "mock";
  await workbenchService.publishSelectedStories(mode);
  revalidatePath("/");
}

export async function addOffer(formData: FormData): Promise<void> {
  await workbenchService.addOffer(requiredValue(formData, "offerId"));
  revalidatePath("/");
}

export async function removeOffer(formData: FormData): Promise<void> {
  await workbenchService.removeOffer(requiredValue(formData, "offerId"));
  revalidatePath("/");
}

export async function generateNewsletter(): Promise<void> {
  await workbenchService.generateNewsletter();
  revalidatePath("/");
}

export async function approveNewsletter(): Promise<void> {
  await workbenchService.approveNewsletter();
  revalidatePath("/");
}

export async function stageApprovedNewsletter(): Promise<void> {
  await workbenchService.stageApprovedNewsletter();
  revalidatePath("/");
}
