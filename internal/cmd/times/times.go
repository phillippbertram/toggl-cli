package times

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/AlecAivazis/survey/v2"
	"github.com/AlecAivazis/survey/v2/terminal"
	"github.com/fatih/color"
	"github.com/jedib0t/go-pretty/table"
	"github.com/spf13/cobra"
	"phillipp.io/toggl-cli/internal/api"
	"phillipp.io/toggl-cli/internal/cmd/times/ls"
	"phillipp.io/toggl-cli/internal/service"
	"phillipp.io/toggl-cli/internal/utils"
)

const PRICE_PER_HOUR = 110.0

// Define the API token flag
type TimesOpts struct {
	timeService *service.TimeService
	interactive bool
	apiToken    string
	startDate   string
	endDate     string
}

func (opts *TimesOpts) print() {
	apiToken := "********"
	if opts.apiToken == "" {
		apiToken = "not set"
	}

	fmt.Printf("API Token: %s\n", apiToken)
	fmt.Printf("Start Date: %s\n", opts.startDate)
	fmt.Printf("End Date: %s\n", opts.endDate)
}

func NewCmdTimes() *cobra.Command {

	opts := TimesOpts{
		interactive: false,
	}

	cmd := &cobra.Command{
		Use:   "times",
		Short: "Download all time entries for a time range",
		RunE: func(cmd *cobra.Command, args []string) error {

			interactiveCheckForApiToken(cmd, &opts)
			interactiveCheckForStartDate(&opts)
			interactiveCheckForEndDate(&opts)

			api := api.NewApi(api.ApiOpts{ApiToken: opts.apiToken})
			opts.timeService = service.NewTimeService(api)

			return timesRun(&opts)
		},
	}

	cmd.Flags().StringVarP(&opts.startDate, "start", "s", "", "Start date (YYYY-MM-DD)")
	cmd.Flags().StringVarP(&opts.endDate, "end", "e", "", "End date (YYYY-MM-DD)")

	cmd.AddCommand(ls.NewCmdLs())

	return cmd
}

func interactiveCheckForApiToken(cmd *cobra.Command, opts *TimesOpts) {
	if opts.apiToken != "" {
		return
	}

	utils.GetApiToken(cmd, &opts.apiToken)

	prompt := &survey.Input{
		Message: "Please enter your Toggl Track API token:",
		Help:    "https://track.toggl.com/profile",
	}
	survey.AskOne(prompt, &opts.apiToken, survey.WithValidator(survey.Required))

	if opts.apiToken == "" {
		log.Fatalf("%s", color.RedString("No API token provided"))
	}
}

func interactiveCheckForStartDate(opts *TimesOpts) {
	if opts.startDate != "" {
		return
	}

	startOfMonth := utils.GetStartOfMonth().Local().Format(utils.DATE_FORMAT)

	prompt := &survey.Input{
		Message: fmt.Sprintf("Please enter the start date (YYYY-MM-DD) [%s]:", startOfMonth),
	}
	err := survey.AskOne(prompt, &opts.startDate)
	if err != nil {
		if err == terminal.InterruptErr {
			log.Fatal()
		}
	}

	if opts.startDate == "" {
		opts.startDate = startOfMonth
	}
}

func interactiveCheckForEndDate(opts *TimesOpts) {
	if opts.endDate != "" {
		return
	}

	today := utils.GetEndOfTodayDay().Local().Format(time.RFC3339)

	prompt := &survey.Input{
		Message: fmt.Sprintf("Please enter the end date (YYYY-MM-DD) [%s]:", today),
	}
	err := survey.AskOne(prompt, &opts.endDate)
	if err != nil {
		if err == terminal.InterruptErr {
			log.Fatal()
		}
	}

	if opts.endDate == "" {
		opts.endDate = today
	}
}

func timesRun(opts *TimesOpts) error {

	fmt.Printf("=== Options ===\n")
	opts.print()
	fmt.Printf("===============\n\n")

	// startDate, err := utils.ParseDateTime(opts.startDate, false)
	// if err != nil {
	// 	return fmt.Errorf("failed to parse start date: %v", err)
	// }

	// endDate, err := utils.ParseDateTime(opts.endDate, true)
	// if err != nil {
	// 	return fmt.Errorf("failed to parse end date: %v", err)
	// }

	// groupedEntries, err := opts.timeService.GetGroupedTimeEntries(&service.GetTimeEntriesOpts{
	// 	StartDate: &startDate,
	// 	EndDate:   &endDate,
	// })

	// if err != nil {
	// 	return fmt.Errorf("failed to download time entries: %v", err)
	// }

	// for _, entries := range groupedEntries {
	// 	print(entries.Entries, entries.ProjectName)
	// }

	return nil

}

func timesRun2(opts *TimesOpts) error {

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

	entries, err := opts.timeService.GetTimeEntries(&service.GetTimeEntriesOpts{
		StartDate: &startDate,
		EndDate:   &endDate,
	})
	if err != nil {
		log.Fatalf("Failed to download time entries: %v", err)
	}
	entries = service.IgnoreRunningEntries(entries)

	totalDuration := time.Duration(0)
	for _, entry := range entries {
		totalDuration += time.Duration(entry.TimeEntry.Duration) * time.Second
	}

	earliestEntry := service.GetEarliestEntry(entries)
	latestEntry := service.GetLatestEntry(entries)

	timeRangeDays := utils.GetDaysBetween(earliestEntry.TimeEntry.Start, latestEntry.TimeEntry.Start)
	fmt.Printf("Time Entries Range: %s - %s (%d days)\n\n",
		earliestEntry.TimeEntry.Start.Local().Format(time.DateTime),
		latestEntry.TimeEntry.Start.Local().Format(time.DateTime),
		len(timeRangeDays),
	)

	// group by description
	aggregated := map[string]time.Duration{}
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
		aggregated[key] += time.Duration(entry.Duration) * time.Second
	}

	totalDuration = time.Duration(0)
	for _, duration := range aggregated {
		totalDuration += duration
	}

	t := table.NewWriter()
	t.SetStyle(table.StyleColoredBlueWhiteOnBlack)
	t.SetOutputMirror(os.Stdout)
	t.AppendHeader(table.Row{"Client/Project/Description", "Duration (hours)", "Price (EUR)"})
	for key, duration := range aggregated {
		t.AppendRow(table.Row{key, utils.FormatDuration(duration), PRICE_PER_HOUR * float64(utils.DurationToHours(duration))})
	}
	t.AppendFooter(table.Row{"Total", utils.FormatDuration(totalDuration), PRICE_PER_HOUR * float64(utils.DurationToHours(totalDuration))})

	// TODO add sorting, this is not working properly
	t.SortBy([]table.SortBy{
		{Name: "Duration (hours)", Mode: table.Asc},
	})
	t.Render()

	return nil
}

func printGroup(group service.GroupedEntry) {
	entries := group.Entries

	totalDuration := time.Duration(0)
	for _, entry := range group.Entries {
		totalDuration += time.Duration(entry.TimeEntry.Duration) * time.Second
	}

	earliestEntry := service.GetEarliestEntry(entries)
	latestEntry := service.GetLatestEntry(entries)

	timeRangeDays := utils.GetDaysBetween(earliestEntry.TimeEntry.Start, latestEntry.TimeEntry.Start)
	fmt.Printf("Time Entries Range: %s - %s (%d days)\n\n",
		earliestEntry.TimeEntry.Start.Local().Format(time.DateTime),
		latestEntry.TimeEntry.Start.Local().Format(time.DateTime),
		len(timeRangeDays),
	)

	// group by description
	aggregated := map[string]time.Duration{}
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
		aggregated[key] += time.Duration(entry.Duration) * time.Second
	}

	totalDuration = time.Duration(0)
	for _, duration := range aggregated {
		totalDuration += duration
	}

	t := table.NewWriter()
	t.SetStyle(table.StyleColoredBlueWhiteOnBlack)
	t.SetOutputMirror(os.Stdout)
	t.AppendHeader(table.Row{"Client/Project/Description", "Duration (hours)", "Price (EUR)"})
	for key, duration := range aggregated {
		t.AppendRow(table.Row{key, utils.FormatDuration(duration), PRICE_PER_HOUR * float64(utils.DurationToHours(duration))})
	}
	t.AppendFooter(table.Row{"Total", utils.FormatDuration(totalDuration), PRICE_PER_HOUR * float64(utils.DurationToHours(totalDuration))})

	// TODO add sorting, this is not working properly
	t.SortBy([]table.SortBy{
		{Name: "Duration (hours)", Mode: table.Asc},
	})
	t.Render()
}
