export type ApprovedNewsletterSnapshot = {
  draftId: string;
  approvalFingerprint: string;
  generatedInputFingerprint: string;
  subject: string;
  preheader: string;
  html: string;
  plainText: string;
};

export type ApprovedNewsletterIdentity = {
  generatedInputFingerprint: string;
  subject: string;
  preheader: string;
  html: string;
  plainText: string;
};
