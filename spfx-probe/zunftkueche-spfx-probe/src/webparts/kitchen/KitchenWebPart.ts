import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { SPHttpClient } from '@microsoft/sp-http';
import { SharePointStore } from '../../kitchen/sharepoint.ts';
import { KitchenView } from '../../kitchen/view.ts';
import styles from './KitchenWebPart.module.scss';

export default class KitchenWebPart extends BaseClientSideWebPart<Record<string, never>> {
  private view?: KitchenView;
  public render(): void {
    this.view?.dispose();
    this.domElement.classList.add(styles.kitchen);
    const testMode = new URL(window.location.href).searchParams.get('zk-test') === '1';
    const store = new SharePointStore(
      this.context.pageContext.web.absoluteUrl,
      async (url, options) => this.context.spHttpClient.fetch(url, SPHttpClient.configurations.v1, options),
      testMode
    );
    const user = this.context.pageContext.user;
    this.view = new KitchenView(this.domElement, store, user.displayName + ' · ' + (user.email || user.loginName));
    this.view.start().catch(error => {
      this.domElement.textContent =
        error instanceof Error ? error.message : 'Verbindung nicht möglich. Bitte neu laden.';
    });
  }
  protected onDispose(): void {
    this.view?.dispose();
  }
}
