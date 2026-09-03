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

function collectedValues(formData: FormData, field: string): string[] {
  return formData
    .getAll(field)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

export async function fetchLatestStories(): Promise<void> {
  await workbenchService.fetchLatestStories();
  revalidatePath("/");
}

export async function addSelectedStories(formData: FormData): Promise<void> {
  await workbenchService.addStories(collectedValues(formData, "storyId"));
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

export async function removeBlock(formData: FormData): Promise<void> {
  await workbenchService.removeBlock(requiredValue(formData, "blockKey"));
  revalidatePath("/");
}

export async function moveBlockUp(formData: FormData): Promise<void> {
  await workbenchService.moveBlock(requiredValue(formData, "blockKey"), "up");
  revalidatePath("/");
}

export async function moveBlockDown(formData: FormData): Promise<void> {
  await workbenchService.moveBlock(requiredValue(formData, "blockKey"), "down");
  revalidatePath("/");
}

export async function reorderLayout(blockKeys: string[]): Promise<void> {
  await workbenchService.reorderLayout(blockKeys);
  revalidatePath("/");
}

export async function addSelectedOffers(formData: FormData): Promise<void> {
  await workbenchService.addOffers(collectedValues(formData, "offerId"));
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

export async function publishApprovedNewsletter(): Promise<void> {
  await workbenchService.publishApprovedNewsletter();
  revalidatePath("/");
}

export async function stageApprovedNewsletter(): Promise<void> {
  await workbenchService.stageApprovedNewsletter();
  revalidatePath("/");
}
