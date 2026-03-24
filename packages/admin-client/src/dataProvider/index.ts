import { combineDataProviders } from "react-admin";
import { devicesDataProvider } from "./devices.js";
import { usersDataProvider } from "./users.js";

export const dataProvider = combineDataProviders((resource) => {
  switch (resource) {
    case "devices":
      return devicesDataProvider;
    case "users":
      return usersDataProvider;
    default:
      throw new Error(`Unknown resource: ${resource}`);
  }
});
