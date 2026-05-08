export type PreparednessApiRole = 'super-admin' | 'sub-admin' | 'user';

export type PreparednessApiTask = {
  _id: string;
  title: string;
  createdBy: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PreparednessApiGroup = {
  _id: string;
  category: string;
  tasks: PreparednessApiTask[];
};

export type PreparednessUiTask = {
  id: string;
  title: string;
  persisted: boolean;
  /** Present for persisted tasks from API (e.g. sub-admin preparedness editor). */
  createdBy?: string;
  updatedAt?: string;
};

export type PreparednessUiSection = {
  preparednessId: string;
  category: string;
  label: string;
  tasks: PreparednessUiTask[];
};
