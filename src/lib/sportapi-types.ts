/** SportAPI statistics / incidents response shapes (Sofascore via RapidAPI). */

export interface SportApiStatisticItem {
  name?: string;
  home?: string;
  away?: string;
}

export interface SportApiStatisticGroup {
  statisticsItems?: SportApiStatisticItem[];
}

export interface SportApiStatisticPeriod {
  period?: string;
  groups?: SportApiStatisticGroup[];
}

export interface SportApiStatisticsResponse {
  statistics?: SportApiStatisticPeriod[];
}

export type SportApiIncidentSide = "home" | "away";

export interface SportApiIncident {
  incidentType?: string;
  incidentClass?: string;
  teamSide?: SportApiIncidentSide | string;
}

export interface SportApiIncidentsResponse {
  incidents?: SportApiIncident[];
}

export interface SportApiResultNote {
  id: string;
  note: string;
}
