package report

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/AlecAivazis/survey/v2"
	"github.com/AlecAivazis/survey/v2/terminal"
	"github.com/fatih/color"
	"github.com/jedib0t/go-pretty/v6/table"
	"github.com/spf13/cobra"
	"phillipp.io/toggl-cli/internal/api"
	"phillipp.io/toggl-cli/internal/config"
	"phillipp.io/toggl-cli/internal/service"
	"phillipp.io/toggl-cli/internal/utils"
)

// Define the API token flag
type ReportOpts struct {
	timeService *service.TimeService
	interactive bool
	apiToken    string
	startDate   string
	endDate     string
	expanded    bool
}

func (opts *ReportOpts) print() {
	apiToken := "********"
	if opts.apiToken == "" {
		apiToken = "not set"
	}

	fmt.Printf("API Token: %s\n", apiToken)
	fmt.Printf("Start Date: %s\n", opts.startDate)
	fmt.Printf("End Date: %s\n", opts.endDate)
}

func NewCmdReport() *cobra.Command {

	opts := ReportOpts{
		interactive: false,
	}

	cmd := &cobra.Command{
		Use:   "report",
		Short: "Makes a report of all time entries for a time range grouped by project",
		RunE: func(cmd *cobra.Command, args []string) error {

			interactiveCheckForApiToken(cmd, &opts)
			interactiveCheckForStartDate(&opts)
			interactiveCheckForEndDate(&opts)

			api := api.NewApi(api.ApiOpts{ApiToken: opts.apiToken})
			opts.timeService = service.NewTimeService(api)

			return reportRun(&opts)
		},
	}

	cmd.Flags().BoolVarP(&opts.interactive, "interactive", "i", false, "Interactive mode")
	cmd.Flags().StringVarP(&opts.startDate, "start", "s", "", "Start date (YYYY-MM-DD)")
	cmd.Flags().StringVarP(&opts.endDate, "end", "e", "", "End date (YYYY-MM-DD)")
	cmd.Flags().BoolVarP(&opts.expanded, "expanded", "x", false, "Show expanded report")

	return cmd
}

func interactiveCheckForApiToken(cmd *cobra.Command, opts *ReportOpts) {
	if opts.apiToken != "" {
		return
	}

	utils.GetApiToken(cmd, &opts.apiToken)
	if opts.apiToken != "" {
		return
	}

	prompt := &survey.Input{
		Message: "Please enter your Toggl Track API token:",
		Help:    "https://track.toggl.com/profile",
	}
	survey.AskOne(prompt, &opts.apiToken, survey.WithValidator(survey.Required))
	if opts.apiToken == "" {
		log.Fatalf("%s", color.RedString("No API token provided"))
	}
}

func interactiveCheckForStartDate(opts *ReportOpts) {
	// was set via flag?
	if opts.startDate != "" {
		return
	}

	// was set via config?
	config := config.GetConfig()
	if config.Report.Start != nil && *config.Report.Start != "" {
		opts.startDate = *config.Report.Start
		return
	}

	defaultStartDate := utils.GetStartOfWeek().Local().Format(utils.DATE_FORMAT)

	// ask for it
	if opts.interactive {
		prompt := &survey.Input{
			Message: fmt.Sprintf("Please enter the start date (YYYY-MM-DD) [%s]:", defaultStartDate),
		}
		err := survey.AskOne(prompt, &opts.startDate)
		if err != nil {
			if err == terminal.InterruptErr {
				log.Fatal()
			}
		}
	}

	if opts.startDate == "" {
		opts.startDate = defaultStartDate
	}
}

func interactiveCheckForEndDate(opts *ReportOpts) {

	if opts.endDate != "" {
		return
	}

	today := utils.GetEndOfTodayDay().Local().Format(time.RFC3339)

	if opts.interactive {
		prompt := &survey.Input{
			Message: fmt.Sprintf("Please enter the end date (YYYY-MM-DD) [%s]:", today),
		}
		err := survey.AskOne(prompt, &opts.endDate)
		if err != nil {
			if err == terminal.InterruptErr {
				log.Fatal()
			}
		}
	}

	if opts.endDate == "" {
		opts.endDate = today
	}
}

func reportRun(opts *ReportOpts) error {

	fmt.Printf("=== Options ===\n")
	opts.print()
	fmt.Printf("===============\n\n")

	startDate, err := utils.ParseDateTime(opts.startDate, false)
	if err != nil {
		return fmt.Errorf("failed to parse start date: %v", err)
	}

	endDate, err := utils.ParseDateTime(opts.endDate, true)
	if err != nil {
		return fmt.Errorf("failed to parse end date: %v", err)
	}

	groupedEntries, err := opts.timeService.GetGroupedTimeEntries(&service.GetTimeEntriesOpts{
		StartDate: &startDate,
		EndDate:   &endDate,
	})

	if err != nil {
		return fmt.Errorf("failed to download time entries: %v", err)
	}

	for _, group := range groupedEntries {
		printGroup(group, opts)

		fmt.Println()
		fmt.Println(strings.Repeat("-", 80))
		fmt.Println()
	}

	return nil

}

func printGroup(group service.GroupedEntry, opts *ReportOpts) {
	entries := group.Entries
	aggregated := aggregateEntries(entries)
	statistics := service.GetStatistics(entries)
	config := config.GetConfig()
	estimatedPrice := statistics.TotalDuration.Minutes() * config.Report.PricePerHour / 60
	estimatedPriceIncldVat := estimatedPrice * (1 + config.Report.Vat)

	var title string = ""
	if statistics.EarliestEntry != nil && statistics.LatestEntry != nil {
		timeRangeDays := utils.GetDaysBetween(statistics.EarliestEntry.TimeEntry.Start, statistics.LatestEntry.TimeEntry.Start)
		title = fmt.Sprintf("Range: %s - %s (%d days)\n\n",
			statistics.EarliestEntry.TimeEntry.Start.Local().Format(time.DateTime),
			statistics.LatestEntry.TimeEntry.Start.Local().Format(time.DateTime),
			len(timeRangeDays),
		)
	}

	t := table.NewWriter()
	t.SetStyle(table.StyleColoredBlueWhiteOnBlack)
	t.SetOutputMirror(os.Stdout)
	t.AppendHeader(table.Row{"Client/Project/Group", "Duration (hours)", fmt.Sprintf("Price (%s)", config.Report.Currency)})
	t.SetTitle(title)

	for key, group := range aggregated {
		t.AppendRow(table.Row{key, utils.FormatDuration(group.Duration)})

		if opts.expanded {
			for _, entry := range group.Entries {
				// show row with description and duration
				t.AppendRow(table.Row{*entry.TimeEntry.Description, utils.FormatDuration(time.Duration(entry.TimeEntry.Duration) * time.Second)})
			}
			t.AppendSeparator()
		}
	}

	t.AppendFooter(table.Row{"Total", utils.FormatDuration(statistics.TotalDuration), fmt.Sprintf("%.2f€ /  %.2f€", estimatedPrice, estimatedPriceIncldVat)})
	t.Render()
}

type GroupedEntry struct {
	Project *api.ProjectDto
	Client  *api.ClientDto
	Entries []service.TimeEntry
	time.Duration
}

func aggregateEntries(entries []service.TimeEntry) map[string]GroupedEntry {
	aggregated := map[string]GroupedEntry{}
	for _, eentry := range entries {
		entry := eentry.TimeEntry
		project := eentry.Project
		client := eentry.Client
		group := strings.Split(*entry.Description, ":")[0]

		if group == "" {
			group = "<NO_DESCRIPTION>"
		}

		keys := []string{}
		if client != nil {
			keys = append(keys, client.Name)
		} else {
			keys = append(keys, "NO_CLIENT")
		}
		if project != nil {
			keys = append(keys, project.Name)
		} else {
			keys = append(keys, "NO_PROJECT")
		}
		keys = append(keys, group)

		key := strings.Join(keys, "/")
		aggregated[key] = GroupedEntry{
			Project:  project,
			Client:   client,
			Entries:  append(aggregated[key].Entries, eentry),
			Duration: aggregated[key].Duration + time.Duration(entry.Duration)*time.Second,
		}
	}
	return aggregated
}
