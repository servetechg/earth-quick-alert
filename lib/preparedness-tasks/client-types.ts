export type PreparednessApiRole = 'super-admin' | 'sub-admin' | 'user';

export type PreparednessApiTask = {
  _id: string;
  title: string;
  createdBy: string;
  isActive: boolean;
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
};

export type PreparednessUiSection = {
  preparednessId: string;
  category: string;
  label: string;
  tasks: PreparednessUiTask[];
};
