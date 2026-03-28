import { Admin, Resource } from "react-admin";
import { authProvider } from "./authProvider.js";
import { Resource as R } from "./constants.js";
import { Dashboard } from "./Dashboard.js";
import { dataProvider } from "./dataProvider/index.js";
import { LoginPage } from "./LoginPage.js";
import { DeviceEdit, DeviceList, DeviceShow } from "./resources/devices/index.js";
import {
  ReleaseCreate,
  ReleaseEdit,
  ReleaseList,
  ReleaseShow,
} from "./resources/releases/index.js";
import { UserList, UserShow } from "./resources/users/index.js";

export function App() {
  return (
    <Admin
      authProvider={authProvider}
      dataProvider={dataProvider}
      dashboard={Dashboard}
      loginPage={LoginPage}
      requireAuth
    >
      <Resource name={R.devices} list={DeviceList} show={DeviceShow} edit={DeviceEdit} />
      <Resource name={R.users} list={UserList} show={UserShow} recordRepresentation="name" />
      <Resource
        name={R.releases}
        list={ReleaseList}
        show={ReleaseShow}
        create={ReleaseCreate}
        edit={ReleaseEdit}
      />
    </Admin>
  );
}
