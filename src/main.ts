import { App } from './app/App';
import './styles/global.css';

const mount = document.querySelector<HTMLElement>('#app');

if (!mount) {
  throw new Error('App mount node was not found.');
}

const app = new App(mount);

app.start().catch((error) => {
  console.error('[ORBITAL BASTION] Failed to start app', error);
});
