import type { Publication } from "@/src/domain/workbench";

export const INTERNAL_POC_PUBLICATION: Publication = {
  id: "publication_poc_default",
  name: "POC default publication",
};

export const POC_PUBLICATIONS: readonly Publication[] = [INTERNAL_POC_PUBLICATION];
