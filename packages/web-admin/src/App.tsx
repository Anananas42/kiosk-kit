import { Admin, Resource } from "react-admin";
import { authProvider } from "./authProvider.js";
import { Dashboard } from "./Dashboard.js";
import { dataProvider } from "./dataProvider/index.js";
import { LoginPage } from "./LoginPage.js";
import { DeviceEdit, DeviceList } from "./resources/devices.js";
import { ReleaseCreate, ReleaseEdit, ReleaseList } from "./resources/releases.js";
import { UserList, UserShow } from "./resources/users.js";

export function App() {
  return (
    <Admin
      authProvider={authProvider}
      dataProvider={dataProvider}
      dashboard={Dashboard}
      loginPage={LoginPage}
      requireAuth
    >
      <Resource name="devices" list={DeviceList} edit={DeviceEdit} />
      <Resource name="users" list={UserList} show={UserShow} recordRepresentation="name" />
      <Resource name="releases" list={ReleaseList} create={ReleaseCreate} edit={ReleaseEdit} />
    </Admin>
  );
}
