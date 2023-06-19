package cmd

import (
	"github.com/spf13/cobra"

	"phillipp.io/toggl-cli/internal/cmd/active"
	"phillipp.io/toggl-cli/internal/cmd/start"
	"phillipp.io/toggl-cli/internal/cmd/stop"
	"phillipp.io/toggl-cli/internal/cmd/times"
)

func NewCmdRoot() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "tgl <command> <subcommand> [flags]",
		Short: "Toggl Tack CLI",
		Long:  `Work with the Toggl Track API from the command line`,
	}

	cmd.PersistentFlags().StringP("token", "t", "", "Toggl Track API token")

	cmd.AddCommand(times.NewCmdTimes())
	cmd.AddCommand(start.NewCmdStart())
	cmd.AddCommand(stop.NewCmdStop())
	cmd.AddCommand(active.NewCmdActive())

	initViper()

	return cmd
}

func initViper() {
	// cobra.OnInitialize(initConfig)

	// rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default is $HOME/.cobra.yaml)")
	// rootCmd.PersistentFlags().StringP("author", "a", "YOUR NAME", "author name for copyright attribution")
	// rootCmd.PersistentFlags().StringVarP(&userLicense, "license", "l", "", "name of license for the project")
	// rootCmd.PersistentFlags().Bool("viper", true, "use Viper for configuration")
	// viper.BindPFlag("author", rootCmd.PersistentFlags().Lookup("author"))
	// viper.BindPFlag("useViper", rootCmd.PersistentFlags().Lookup("viper"))
	// viper.SetDefault("author", "NAME HERE <EMAIL ADDRESS>")
	// viper.SetDefault("license", "apache")

}

// func initConfig() {
// 	if cfgFile != "" {
// 		// Use config file from the flag.
// 		viper.SetConfigFile(cfgFile)
// 	} else {
// 		// Find home directory.
// 		home, err := os.UserHomeDir()
// 		cobra.CheckErr(err)

// 		// Search config in home directory with name ".cobra" (without extension).
// 		viper.AddConfigPath(home)
// 		viper.SetConfigType("yaml")
// 		viper.SetConfigName(".cobra")
// 	}

// 	viper.AutomaticEnv()

// 	if err := viper.ReadInConfig(); err == nil {
// 		fmt.Println("Using config file:", viper.ConfigFileUsed())
// 	}
// }
