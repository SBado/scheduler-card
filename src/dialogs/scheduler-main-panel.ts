import {
  mdiChevronLeft,
  mdiChevronRight,
  mdiContentCopy,
  mdiContentPaste,
  mdiDotsVertical,
  mdiRestart,
  mdiPencil,
  mdiShapeRectanglePlus,
  mdiTrashCanOutline,
} from '@mdi/js';
import { CSSResultGroup, LitElement, PropertyValues, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators';
import { Action, CardConfig, EditorMode, Schedule, ScheduleEntry, TWeekday, Time, Timeslot } from '../types';
import { actionConfig } from '../data/actions/action_config';
import { formatWeekdayDisplay } from '../data/days';
import { defaultSelectorValue } from '../data/selectors/default_selector_value';
import { isSupportedSelector } from '../data/selectors/is_supported_selector';
import { selectorConfig } from '../data/selectors/selector_config';
import { NumberSelector, Selector } from '../lib/selector';
import { DialogSelectActionParams } from './dialog-select-action';
import { DialogSelectWeekdayParams } from './dialog-select-weekdays';

import { computeDomain } from '../lib/entity';
import { computeTimestamp } from '../data/time/compute_timestamp';
import { HomeAssistant } from '../lib/types';
import { localize } from '../localize/localize';
import { insertTimeslot } from '../data/schedule/insert_timeslot';
import { removeTimeslot } from '../data/schedule/remove_timeslot';
import { formatFieldDisplay } from '../data/format/format_field_display';
import { formatActionDisplay } from '../data/format/format_action_display';
import { computeActionIcon } from '../data/format/compute_action_icon';
import { fireEvent } from '../lib/fire_event';
import { useAmPm } from '../lib/use_am_pm';
import { capitalizeFirstLetter } from '../lib/capitalize_first_letter';
import { hassLocalize } from '../localize/hassLocalize';
import { isDefined } from '../lib/is_defined';
import { moveTimeslot } from '../data/schedule/move_timeslot';
import { computeEntityDisplay } from '../data/format/compute_entity_display';
import { DEFAULT_TIME_STEP } from '../const';
import { HassEntity } from 'home-assistant-js-websocket';

import '../components/scheduler-timeslot-editor';
import '../components/scheduler-time-picker';
import '../components/scheduler-entity-picker';
import '../dialogs/dialog-select-weekdays';
import '../dialogs/dialog-select-action';
import '../components/scheduler-collapsible-section';
import '../components/scheduler-settings-row';
import '../components/scheduler-combo-selector';

@customElement('scheduler-main-panel')
export class SchedulerMainPanel extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public config!: CardConfig;
  @property({ attribute: false }) public viewMode!: EditorMode;
  @property({ attribute: false }) public selectedSlot: number | null = null;
  @property({ type: Boolean }) large = false;

  @state() schedule!: Schedule;
  @state() selectedEntry: number | null = 0;

  private _defaultSlotColor(): string {
    const raw = getComputedStyle(this).getPropertyValue('--rgb-primary-color').trim();
    const parts = raw.split(',').map((s) => parseInt(s.trim(), 10));
    if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
      return '#' + parts.map((n) => n.toString(16).padStart(2, '0')).join('');
    }
    return '#FFFFFF';
  }

  private _toHex(color: string): string {
    if (!color) return this._defaultSlotColor();

    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
      if (color.length === 4) {
        return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
      }
      return color;
    }

    const rgbMatch = color.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
    if (rgbMatch) {
      return (
        '#' + [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map((n) => parseInt(n).toString(16).padStart(2, '0')).join('')
      );
    }

    const hslMatch = color.match(/^hsl\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/);
    if (hslMatch) {
      const h = parseInt(hslMatch[1]) / 360;
      const s = parseInt(hslMatch[2]) / 100;
      const l = parseInt(hslMatch[3]) / 100;
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
      const g = Math.round(hue2rgb(p, q, h) * 255);
      const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
      return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
    }

    return this._defaultSlotColor();
  }

  shouldUpdate(changedProps: PropertyValues): boolean {
    if (changedProps.get('schedule')) {
      this.dispatchEvent(new CustomEvent('change', { detail: { schedule: this.schedule } }));
    }
    return true;
  }

  render() {
    return html`
      ${this.schedule.entries.map(
        (entry, num) => html`
          <div class="editor-header">
            <div class="weekdays">
              <span>
                ${localize('ui.panel.editor.repeated_days', this.hass)}:
                ${formatWeekdayDisplay(entry.weekdays, 'short', this.hass)}
              </span>
              <ha-icon-button
                .path=${mdiPencil}
                @click=${(ev: Event) => this._showWeekdayDialog(ev, num)}
              ></ha-icon-button>
            </div>
            <div class="weekdays-actions">
              <ha-button appearance="plain" size="small" @click=${this.toggleViewMode}>
                ${this.viewMode == EditorMode.Scheme
                  ? localize('ui.panel.editor.toggle_single_mode', this.hass)
                  : localize('ui.panel.editor.toggle_scheme_mode', this.hass)}
                <ha-icon slot="end" icon="mdi:swap-horizontal"></ha-icon>
              </ha-button>
            </div>
          </div>

          ${this.viewMode == EditorMode.Scheme
            ? html`
                <div class="editor-header">
                  <div class="weekdays">${this.hass.localize('ui.dialogs.helper_settings.input_datetime.time')}:</div>
                  ${this.renderActionButtons()}
                </div>
                <scheduler-timeslot-editor
                  .hass=${this.hass}
                  .config=${this.config}
                  .schedule=${entry}
                  .selectedSlot=${this.selectedSlot}
                  @update=${(ev: CustomEvent) => this._handleUpdate(ev, num)}
                  .large=${this.large}
                >
                </scheduler-timeslot-editor>
              `
            : html`
                ${this.hass.localize('ui.dialogs.helper_settings.input_datetime.time')}:
                <scheduler-time-picker
                  .hass=${this.hass}
                  .time=${this.schedule.entries[this.selectedEntry!].slots[this.selectedSlot!].start}
                  @value-changed=${this._startTimeChanged}
                  ?useAmPm=${useAmPm(this.hass.locale)}
                  .stepSize=${this.config.time_step || DEFAULT_TIME_STEP}
                  large
                >
                </scheduler-time-picker>
              `}
        `
      )}
      ${this.renderSlot()}
    `;
  }

  toggleViewMode() {
    const newViewMode: EditorMode = this.viewMode == EditorMode.Scheme ? EditorMode.Single : EditorMode.Scheme;
    this.dispatchEvent(new CustomEvent('setViewMode', { detail: newViewMode }));
  }

  renderActionButtons() {
    if (this.selectedSlot === null || this.selectedEntry === null) return html``;

    const startTime = this.schedule.entries[this.selectedEntry].slots[this.selectedSlot].start;
    const stopTime = this.schedule.entries[this.selectedEntry].slots[this.selectedSlot].stop || startTime;

    const tsA = computeTimestamp(startTime, this.hass);
    const tsB = computeTimestamp(stopTime, this.hass) || 24 * 3600;

    const delta = tsB - tsA;

    return html`
      <div class="actions">
        <ha-icon-button
          .path=${mdiChevronLeft}
          @click=${(ev: Event) => {
            this._updateSelectedSlot(this.selectedSlot! - 1);
            (ev.target as HTMLElement).blur();
          }}
          ?disabled=${this.selectedSlot === null || this.selectedSlot < 1}
        >
        </ha-icon-button>
        <ha-icon-button
          .path=${mdiChevronRight}
          @click=${(ev: Event) => {
            this._updateSelectedSlot(this.selectedSlot! + 1);
            (ev.target as HTMLElement).blur();
          }}
          ?disabled=${this.selectedSlot === null ||
          this.selectedSlot > this.schedule.entries[this.selectedEntry].slots.length - 2}
        >
        </ha-icon-button>
        <ha-icon-button .path=${mdiShapeRectanglePlus} @click=${this._addTimeslot} ?disabled=${delta < 1800}>
        </ha-icon-button>
        <ha-icon-button
          .path=${mdiTrashCanOutline}
          @click=${this._removeTimeslot}
          ?disabled=${this.schedule.entries[this.selectedEntry].slots.length <= 2}
        >
        </ha-icon-button>
      </div>
    `;
  }

  renderSlot() {
    if (this.selectedEntry === null || this.selectedSlot === null) {
      return html` <div class="slot-placeholder">${localize('ui.panel.editor.select_timeslot', this.hass)}</div> `;
    }
    const slot = this.schedule.entries[this.selectedEntry].slots[this.selectedSlot];
    const isLastSlot = this.selectedSlot === this.schedule.entries[this.selectedEntry!].slots.length - 1;
    let endTime = slot.stop;
    if (!endTime && this.selectedSlot < this.schedule.entries[this.selectedEntry].slots.length - 1)
      endTime = this.schedule.entries[this.selectedEntry].slots[this.selectedSlot + 1].start;
    if (!endTime) endTime = slot.start;

    const currentColor = slot.color || '';

    const isValidColor = (v: string): boolean => {
      // hex:  #rgb  #rrggbb
      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return true;
      // rgb:  rgb(0,0,0)  rgb(0, 0, 0)  also with spaces
      if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(v)) return true;
      // hsl:  hsl(360,100%,50%)  hsl(360, 100%, 50%)
      if (/^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)$/.test(v)) return true;
      return false;
    };

    const onColorPickerChange = (ev: Event) => {
      const val = (ev.target as HTMLInputElement).value;
      this._updateSlot({ color: val });
    };

    const onTextInputChange = (ev: Event) => {
      const val = (ev.target as HTMLInputElement).value.trim();
      if (isValidColor(val)) this._updateSlot({ color: val });
    };

    const onCopy = () => {
      if (currentColor) navigator.clipboard.writeText(currentColor);
    };

    const onPaste = async () => {
      try {
        const text = (await navigator.clipboard.readText()).trim();
        const hex = text.startsWith('#') ? text : '#' + text;
        if (isValidColor(hex)) this._updateSlot({ color: hex });
      } catch (_) {}
    };

    const onReset = () => {
      this._updateSlot({ color: this._defaultSlotColor() });
    };

    return html`
      ${this.viewMode == EditorMode.Scheme
        ? html`
            <div class="two-column">
              <div class="column">
                <scheduler-time-picker
                  .hass=${this.hass}
                  label="${localize('ui.panel.editor.start_time', this.hass)}:"
                  ?disabled=${this.selectedSlot == 0}
                  .time=${slot.start}
                  @value-changed=${this._startTimeChanged}
                  ?useAmPm=${useAmPm(this.hass.locale)}
                >
                </scheduler-time-picker>
              </div>
              <div class="column">
                <scheduler-time-picker
                  .hass=${this.hass}
                  label="${localize('ui.panel.editor.stop_time', this.hass)}:"
                  ?disabled=${isLastSlot}
                  .time=${endTime}
                  @value-changed=${this._stopTimeChanged}
                  ?useAmPm=${useAmPm(this.hass.locale)}
                >
                </scheduler-time-picker>
              </div>
            </div>
            <scheduler-settings-row>
              <span slot="heading">${localize('ui.panel.editor.segment_color', this.hass)}</span>
              <div class="color-row">
                <input
                  type="color"
                  class="color-picker"
                  .value=${this._toHex(currentColor)}
                  @input=${onColorPickerChange}
                  title="Pick color"
                />
                <input
                  type="text"
                  class="color-text"
                  .value=${currentColor}
                  placeholder="#rrggbb / rgb() / hsl()"
                  maxlength="32"
                  @change=${onTextInputChange}
                />
                <ha-icon-button
                  .path=${mdiContentCopy}
                  ?disabled=${!currentColor}
                  @click=${onCopy}
                  title="Copy hex"
                ></ha-icon-button>
                <ha-icon-button .path=${mdiContentPaste} @click=${onPaste} title="Paste hex"></ha-icon-button>
                <ha-icon-button .path=${mdiRestart} @click=${onReset} title="Reset to default color"></ha-icon-button>
              </div>
            </scheduler-settings-row>
          `
        : ''}
      ${localize('ui.panel.editor.action', this.hass)}: ${this._renderActionConfig()}
    `;
  }

  _renderActionConfig() {
    const slot: Timeslot = { ...this.schedule.entries[this.selectedEntry!].slots[this.selectedSlot!] };
    const action = slot.actions.length ? slot.actions[0] : undefined;
    if (!action)
      return html`
        <div>
          <ha-button appearance="plain" @click=${this._showActionDialog}>
            <ha-icon slot="start" icon="mdi:plus"></ha-icon>
            ${localize('ui.panel.editor.add_action', this.hass)}
          </ha-button>
        </div>
      `;

    const config = actionConfig(action, this.config.customize);
    const domain = config.target?.domain || computeDomain(action.service);

    const hasFixedEntity =
      isDefined(config?.target?.entity_id) ||
      this.schedule.entries[this.selectedEntry!].slots.some(
        (e) => e.actions.length && isDefined(actionConfig(e.actions[0], this.config.customize)?.target?.entity_id)
      );

    if (config === undefined) return html``;

    //if (!config || !config.fields) return html``;
    const fields = Object.keys(config.fields || {}).filter((e) =>
      isSupportedSelector(action, e, this.hass!, this.config.customize)
    );

    let heading = '';

    let entityIds = [action.target?.entity_id || []].flat();
    if (!entityIds.length && ['notify', 'script'].includes(domain)) entityIds = [action.service];

    if (entityIds.length) {
      heading += entityIds.map((e) => computeEntityDisplay(e, this.hass, this.config.customize)).join(', ');
      heading += ': ';
    }
    heading += formatActionDisplay(action, this.hass, this.config.customize, false, true);

    return html`
      <scheduler-collapsible-section ?expanded=${true} ?disabled=${true}>
        <div slot="header" class="header">
          <ha-icon slot="icon" icon="${computeActionIcon(action, this.config.customize)}"></ha-icon>
          <span>${capitalizeFirstLetter(heading)}</span>
        </div>

        <ha-dropdown
          slot="contextMenu"
          @wa-select=${this._actionItemOptionsClick}
          @wa-after-hide=${(ev: Event) => {
            ((ev.target as HTMLElement).firstElementChild as HTMLElement).blur();
          }}
          placement="bottom-end"
        >
          <ha-icon-button slot="trigger" .path=${mdiDotsVertical}> </ha-icon-button>
          <ha-dropdown-item value="change_type">
            <ha-icon icon="mdi:pencil"></ha-icon>
            ${hassLocalize('ui.panel.lovelace.editor.card.conditional.change_type', this.hass)}
          </ha-dropdown-item>
          <ha-dropdown-item variant="danger" value="delete">
            <ha-icon icon="mdi:delete"></ha-icon>
            ${hassLocalize('ui.common.delete', this.hass)}
          </ha-dropdown-item>
        </ha-dropdown>

        <div slot="content">
          ${config.target
            ? html`
                <scheduler-settings-row>
                  <span slot="heading">${hassLocalize('ui.components.entity.entity-picker.entity', this.hass)}</span>
                  <scheduler-entity-picker
                    .hass=${this.hass}
                    .config=${this.config}
                    .domain=${domain}
                    .filterFunc=${(stateObj: HassEntity) =>
                      config.supported_features
                        ? ((stateObj.attributes.supported_features || 0) & config.supported_features) > 0
                        : true}
                    @value-changed=${this._selectEntity}
                    .value=${[action.target?.entity_id || []].flat()}
                    ?multiple=${true}
                    ?disabled=${hasFixedEntity}
                  >
                  </scheduler-entity-picker>
                </scheduler-settings-row>
              `
            : ''}
          ${fields.map((field) => {
            const selector = selectorConfig(
              action.service,
              action.target?.entity_id,
              field,
              this.hass!,
              this.config.customize
            );
            if (selector === null) return '';
            const optional: boolean | undefined =
              config.fields![field].optional || ((selector as NumberSelector).number || {}).optional;
            const checked = optional ? Object.keys(action.service_data).includes(field) : true;
            return html`
              <scheduler-settings-row ?showPrefix=${optional}>
                ${optional
                  ? html`
                      <ha-checkbox
                        slot="prefix"
                        ?checked=${checked}
                        @change=${(ev: Event) => this._toggleOptionalField(ev, field, selector)}
                      >
                      </ha-checkbox>
                    `
                  : ''}
                <span slot="heading"> ${formatFieldDisplay(action, field, this.hass, this.config.customize)} </span>
                <scheduler-combo-selector
                  .hass=${this.hass}
                  .config=${selector}
                  ?disabled=${!checked}
                  .value=${Object.keys(action.service_data).includes(field) ? action.service_data[field] : undefined}
                  @value-changed=${(ev: CustomEvent) => this._selectField(field, ev)}
                >
                </scheduler-combo-selector>
              </scheduler-settings-row>
            `;
          })}
        </div>
      </scheduler-collapsible-section>
    `;
  }

  _selectField(field: string, ev: CustomEvent) {
    const value = ev.detail.value;

    const slot: Timeslot = { ...this.schedule.entries[this.selectedEntry!].slots[this.selectedSlot!] };
    const action: Action =
      value !== undefined
        ? {
            ...slot.actions[0],
            service_data: {
              ...slot.actions[0].service_data,
              [field]: value,
            },
          }
        : {
            ...slot.actions[0],
            service_data: Object.fromEntries(
              Object.entries(slot.actions[0].service_data).filter(([key]) => key != field)
            ),
          };
    this._updateSlot({ actions: [action] });
  }

  _toggleOptionalField(ev: Event, field: string, selector: Selector) {
    const checked = (ev.target as HTMLInputElement).checked;
    const value = checked ? defaultSelectorValue(selector) : undefined;
    if (checked) {
      this._selectField(
        field,
        new CustomEvent('value-changed', { detail: { value: isDefined(value) ? value : null } })
      );
    } else {
      this._selectField(field, new CustomEvent('value-changed', { detail: { value: undefined } }));
    }
  }

  _selectEntity(ev: CustomEvent) {
    const entity = ev.detail.value as string | string[] | undefined;
    if (!entity) return;

    this.schedule.entries[this.selectedEntry!].slots.forEach((slot, idx) => {
      if (!slot.actions.length) return;
      const action: Action = {
        ...slot.actions[0],
        target: {
          entity_id: entity,
        },
      };
      this._updateSlot({ actions: [action] }, idx);
    });
  }

  _handleUpdate(ev: CustomEvent, entry: number) {
    this.selectedEntry = entry;
    if (ev.detail.hasOwnProperty('selectedSlot')) {
      this._updateSelectedSlot(ev.detail.selectedSlot);
      this.selectedSlot = ev.detail.selectedSlot;
    } else if (ev.detail.hasOwnProperty('slots')) {
      this._updateEntry({ slots: ev.detail.slots });
    }
  }

  _updateSelectedSlot(slot: number | null) {
    this.dispatchEvent(new CustomEvent('change', { detail: { selectedSlot: slot } }));
  }

  _updateEntry(update: Partial<ScheduleEntry>) {
    let entry: ScheduleEntry = { ...this.schedule.entries[this.selectedEntry!] };
    entry = { ...entry, ...update };
    this.schedule = {
      ...this.schedule,
      entries: Object.assign(this.schedule.entries, {
        [this.selectedEntry!]: entry,
      }),
    };
  }

  _updateSlot(update: Partial<Timeslot>, slotIdx = this.selectedSlot!) {
    let slot: Timeslot = { ...this.schedule.entries[this.selectedEntry!].slots[slotIdx] };
    slot = { ...slot, ...update };
    this._updateEntry({
      slots: Object.assign(this.schedule.entries[this.selectedEntry!].slots, {
        [slotIdx]: slot,
      }),
    });
  }

  async _showWeekdayDialog(ev: Event, entry: number) {
    this.selectedEntry = entry;
    await new Promise<TWeekday[] | null>((resolve) => {
      const params: DialogSelectWeekdayParams = {
        weekdays: [...this.schedule.entries[entry].weekdays],
        cancel: () => resolve(null),
        confirm: (out) => resolve(out),
      };

      fireEvent(ev.target as HTMLElement, 'show-dialog', {
        dialogTag: 'dialog-select-weekdays',
        dialogImport: () => import('./dialog-select-weekdays'),
        dialogParams: params,
      });
    }).then((res: TWeekday[] | null) => {
      if (!res) return;
      this._updateEntry({ weekdays: res });
    });
  }

  async _showActionDialog(ev: Event) {
    let filteredDomains: string[] = [];
    let filteredEntities: string[] = [];

    this.schedule.entries.forEach((entry) => {
      entry.slots.forEach((slot) => {
        slot.actions.forEach((action) => {
          filteredEntities = [...filteredEntities, ...[action.target?.entity_id || []].flat()];
          filteredDomains = [
            ...filteredDomains,
            ...[computeDomain(action.service), ...[action.target?.entity_id || []].flat()].map(computeDomain),
          ];
        });
      });
    });
    filteredDomains = [...new Set(filteredDomains)];
    filteredEntities = [...new Set(filteredEntities)];

    await new Promise<Action | null>((resolve) => {
      const params: DialogSelectActionParams = {
        cancel: () => resolve(null),
        confirm: (out: Action) => resolve(out),
        domainFilter: filteredDomains.length ? filteredDomains : undefined,
        entityFilter: filteredEntities.length ? filteredEntities : undefined,
        cardConfig: this.config,
      };

      fireEvent(ev.target as HTMLElement, 'show-dialog', {
        dialogTag: 'dialog-select-action',
        dialogImport: () => import('./dialog-select-action'),
        dialogParams: params,
      });
    }).then((res: Action | null) => {
      if (!res) return;
      const slot: Timeslot = { ...this.schedule.entries[this.selectedEntry!].slots[this.selectedSlot!] };
      const target = this.schedule.entries[this.selectedEntry!].slots.find((e) =>
        e.actions.length ? e.actions[0].target?.entity_id : undefined
      );
      let action = { ...res };
      if (target && action.target) action = { ...action, target: target.actions[0].target };
      this._updateSlot({ actions: [action] });
    });
  }

  _actionItemOptionsClick(ev: CustomEvent) {
    const option: 'delete' | 'change_type' = ev.detail.item.value;
    switch (option) {
      case 'change_type':
        this._showActionDialog(ev);
        break;
      case 'delete':
        this._updateSlot({ actions: [] });
        break;
    }
  }

  _stopTimeChanged(ev: CustomEvent) {
    const value = ev.detail.value as Time;
    const [slots, slotIdxOut] = moveTimeslot(
      [...this.schedule.entries[this.selectedEntry!].slots],
      Number(this.selectedSlot),
      { stop: value },
      this.hass
    );
    this._updateEntry({ slots: slots });
    if (slotIdxOut != this.selectedSlot) this._updateSelectedSlot(slotIdxOut);
  }

  _startTimeChanged(ev: CustomEvent) {
    const value = ev.detail.value as Time;
    const [slots, slotIdxOut] = moveTimeslot(
      [...this.schedule.entries[this.selectedEntry!].slots],
      Number(this.selectedSlot),
      { start: value },
      this.hass
    );
    this._updateEntry({ slots: slots });
    if (slotIdxOut != this.selectedSlot) this._updateSelectedSlot(slotIdxOut);
  }

  _addTimeslot(ev: Event) {
    if (this.selectedEntry === null || this.selectedSlot === null) return;
    this.schedule = insertTimeslot(this.schedule, this.selectedEntry, this.selectedSlot, this.hass);
    (ev.target as HTMLElement).blur();
  }

  _removeTimeslot(ev: Event) {
    if (this.selectedEntry === null || this.selectedSlot === null) return;
    this.schedule = removeTimeslot(this.schedule, this.selectedEntry, this.selectedSlot);
    if (this.selectedSlot >= this.schedule.entries[this.selectedEntry].slots.length)
      this.selectedSlot = this.schedule.entries[this.selectedEntry].slots.length - 1;
    (ev.target as HTMLElement).blur();
  }

  static get styles(): CSSResultGroup {
    return css`
      :host {
        position: relative;
      }
      .two-column {
        display: flex;
        flex-direction: row;
        margin: 16px 0px;
        flex-wrap: wrap;
        gap: 10px;
      }
      .two-column .column {
        display: flex;
        flex-direction: column;
        flex: 0 0 215px;
      }
      div.editor-header {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
      }
      .weekdays {
        display: flex;
        flex: 1;
        align-items: center;
        white-space: nowrap;
      }
      .weekdays-actions {
        display: flex;
        align-items: center;
      }
      div.actions {
        display: flex;
        align-items: end;
        margin: -4px 0px 0px 0px;
      }
      @media all and (max-width: 150px) {
        div.editor-header {
          flex-direction: column;
          margin-top: 0px;
        }
        div.actions {
          align-self: flex-end;
        }
      }
      div.slot-placeholder {
        padding: 20px 0px 0px 0px;
      }
      scheduler-collapsible-section .header ha-icon {
        margin-right: 6px;
      }
      scheduler-collapsible-section .header span {
        flex: 1;
      }
      ha-list-item.warning,
      ha-list-item.warning ha-icon {
        color: var(--error-color);
      }
      .color-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .color-picker {
        width: 36px;
        height: 36px;
        border: none;
        border-radius: 4px;
        padding: 2px;
        cursor: pointer;
        background: none;
        flex-shrink: 0;
      }
      .color-text {
        width: 160px;
        height: 36px;
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 4px;
        padding: 0 8px;
        font-size: 0.9rem;
        color: var(--primary-text-color);
        background: var(--card-background-color, #fff);
        font-family: monospace;
      }
      .color-text:focus {
        outline: none;
        border-color: var(--primary-color);
      }
    `;
  }
}
