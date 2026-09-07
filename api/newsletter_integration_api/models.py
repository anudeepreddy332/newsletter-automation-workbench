from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ContentFeedModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    sourceKind: Literal["rss"]


class StoryModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    contentFeedId: str
    title: str
    summary: str
    body: str | None = None
    canonicalUrl: str
    imageUrl: str | None = None
    publishedAt: str
    sourceAuthor: str | None = None
    sourceItemId: str | None = None


class StoriesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contentFeed: ContentFeedModel
    stories: list[StoryModel] = Field(default_factory=list)


class IntegrationOfferModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    source: str
    sourceOfferId: str
    advertiserName: str
    offerName: str
    status: Literal["active", "paused"]
    trackingUrl: str


class OffersResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    offers: list[IntegrationOfferModel] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: Literal["ok", "unavailable"]


class ApiErrorResponse(BaseModel):
    error: str
    code: str


EMPTY_CONTENT_FEED = ContentFeedModel(
    id="content_feed_unsynchronized",
    name="No synchronized stories",
    sourceKind="rss",
)


def utc_timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    utc = value.astimezone(timezone.utc)
    milliseconds = utc.microsecond // 1000
    return utc.strftime("%Y-%m-%dT%H:%M:%S.") + f"{milliseconds:03d}Z"
