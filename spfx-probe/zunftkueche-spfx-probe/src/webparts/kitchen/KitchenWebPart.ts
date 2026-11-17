import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { ThemeProvider, type ThemeChangedEventArgs } from '@microsoft/sp-component-base';
import { SPHttpClient } from '@microsoft/sp-http';
import { SharePointStore } from '../../kitchen/sharepoint.ts';
import { KitchenView } from '../../kitchen/view.ts';
import { applyHostTheme } from '../../kitchen/host-theme.ts';
import styles from './KitchenWebPart.module.scss';

export default class KitchenWebPart extends BaseClientSideWebPart<Record<string, never>> {
  private view?: KitchenView;
  private inverted?: boolean;
  private teamsTheme?: string;

  /** Hell oder dunkel kommt vom Rahmen: SharePoint-Theme und, im Teams-Tab, das Teams-Design. Die App hat keinen eigenen Schalter. */
  protected async onInit(): Promise<void> {
    await super.onInit();
    try {
      const provider = this.context.serviceScope.consume(ThemeProvider.serviceKey);
      this.inverted = provider.tryGetTheme()?.isInverted;
      provider.themeChangedEvent.add(this, (args: ThemeChangedEventArgs) => {
        this.inverted = args.theme?.isInverted;
        this.paintTheme();
      });
    } catch {
      // Ohne Theme-Dienst bleibt die App hell.
    }
    const teams = this.context.sdks?.microsoftTeams?.teamsJs;
    if (teams) {
      try {
        this.teamsTheme = (await teams.app.getContext()).app.theme;
        teams.app.registerOnThemeChangeHandler(theme => {
          this.teamsTheme = theme;
          this.paintTheme();
        });
      } catch {
        // Meldet Teams kein Design, entscheidet das SharePoint-Theme.
      }
    }
    this.paintTheme();
  }
  private paintTheme(): void {
    applyHostTheme(this.domElement, this.inverted, this.teamsTheme);
  }
  public render(): void {
    this.view?.dispose();
    this.domElement.classList.add(styles.kitchen);
    this.paintTheme();
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
