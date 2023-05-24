package api

// https://developers.track.toggl.com/

import (
	"fmt"
	"log"
	"time"

	"github.com/go-resty/resty/v2"
)

type Api struct {
	httpClient *resty.Client
}

type ApiOpts struct {
	ApiToken string
}

// Define the base URL for the Toggl Track API v9
const baseURL = "https://api.track.toggl.com/api/v9"

func NewApi(opts ApiOpts) *Api {
	client := resty.New().
		SetBaseURL(baseURL).
		SetDebug(false).
		SetBasicAuth(opts.ApiToken, "api_token")

	return &Api{
		httpClient: client,
	}
}

func (a *Api) GetProjectById(workspaceId int, projectId *int) (*Project, error) {
	project := &Project{}
	_, err := a.httpClient.R().
		SetResult(project).
		Get(fmt.Sprintf("/workspaces/%d/projects/%d", workspaceId, *projectId))
	return project, err
}

func (a *Api) GetClientById(workspaceId int, clientId *int) (*Client, error) {
	resp := &Client{}
	_, err := a.httpClient.R().
		SetResult(resp).
		Get(fmt.Sprintf("/workspaces/%d/clients/%d", workspaceId, *clientId))
	return resp, err
}

type GetTimeEntriesOpts struct {
	// WorkspaceId int

	Since  *time.Time `json:"since"`
	Before *time.Time `json:"before"`

	// YYYY-MM-DD
	StartDate *string `json:"start_date"`

	// YYYY-MM-DD
	EndDate *string `json:"end_date"`
}

// https://developers.track.toggl.com/docs/api/time_entries
func (a *Api) GetTimeEntries(opts *GetTimeEntriesOpts) ([]TimeEntry, error) {

	q := map[string]string{}

	if opts.Since != nil {
		q["since"] = fmt.Sprintf("%d", opts.Since.Local().Unix())
	}

	start, err := time.Parse("2006-01-02", *opts.StartDate)
	if err != nil {
		start = GetFirstDayOfMonth()
	}

	end, err := time.Parse("2006-01-02", *opts.EndDate)
	if err != nil {
		end = GetLastDayOfMonth()
	}

	if opts.Before != nil {
		q["before"] = opts.Before.Local().Format("2006-01-02")
	}

	q["start_date"] = start.Format("2006-01-02")
	q["end_date"] = end.Format("2006-01-02")

	log.Printf("Query: %+v\n", q)

	entries := &[]TimeEntry{}
	_, err = a.httpClient.R().
		SetHeader("Accept", "application/json").
		SetQueryParams(q).
		SetResult(entries).
		Get("/me/time_entries")

	// fmt.Printf("Show on website: https://www.toggl.com/app/reports/summary/%d/from/%s/to/%s\n", opts.WorkspaceId, start.Format("2006-01-02"), end.Format("2006-01-02"))
	// *entries = FilterEntriesForWorkspace(*entries, opts.WorkspaceId)

	return *entries, err
}
