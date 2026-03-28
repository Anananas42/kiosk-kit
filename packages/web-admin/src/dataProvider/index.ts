import { combineDataProviders } from "react-admin";
import { Resource } from "../constants.js";
import { devicesDataProvider } from "./devices.js";
import { releasesDataProvider } from "./releases.js";
import { usersDataProvider } from "./users.js";

export const dataProvider = combineDataProviders((resource) => {
  switch (resource) {
    case Resource.devices:
      return devicesDataProvider;
    case Resource.users:
      return usersDataProvider;
    case Resource.releases:
      return releasesDataProvider;
    default:
      throw new Error(`Unknown resource: ${resource}`);
  }
});
