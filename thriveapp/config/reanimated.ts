// Native navigation libraries can rely on Reanimated being initialised early, so load it here.
// The web build gets the empty `reanimated.web.ts` instead, which keeps ~700 KB out of its bundle.
import 'react-native-reanimated';
